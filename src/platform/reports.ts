import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../db.js";
import { FleetError } from "../domain.js";
import { operationDefinitions } from "../evaluation.js";
import { Observability } from "../observability.js";
import type { Store } from "../store.js";

const idsSchema = z
  .array(z.uuid())
  .min(1)
  .max(10)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate cohort");
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const digest = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
const Link = z
  .object({
    requestId: z.uuid(),
    name: z.string().trim().min(2).max(80),
    cohortIds: idsSchema.refine((ids) => ids.length >= 2),
    design: z.enum(["interacting_world", "independent_replicas", "unspecified"]).default("unspecified"),
  })
  .strict();

export { evaluateSkillReuse } from "../modules/skills/v1/evaluation.js";
export { evidenceChain } from "./evidence.js";

import { evidenceChain } from "./evidence.js";
export class PlatformReports {
  constructor(private store: Store) {}
  private async cohort(id: string, db: PoolClient) {
    const cohort = await this.store.cohort(id, db),
      p = (
        await db.query(
          "SELECT profile_id,profile_version,timed_reviews,environment_ref FROM cohort_engine_profiles WHERE cohort_id=$1",
          [id],
        )
      ).rows[0];
    const bindings = (
      await db.query(
        "SELECT DISTINCT environment_id,environment_version,instance_id FROM environment_bindings b JOIN agents a ON a.id=b.agent_id WHERE a.cohort_id=$1 ORDER BY environment_id,environment_version,instance_id",
        [id],
      )
    ).rows;
    const agents = (await db.query("SELECT ordinal,strategy FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id]))
      .rows;
    const wake =
      (await db.query("SELECT policy FROM cohort_wake_policies WHERE cohort_id=$1", [id])).rows[0]?.policy ?? null;
    const profile = p ? { id: p.profile_id as string, version: p.profile_version as string } : null;
    const configuration = {
      profile,
      environment: bindings,
      selectedEnvironment: p?.environment_ref ?? null,
      model: cohort.model,
      budget: cohort.budget,
      intervalMinutes: cohort.interval_minutes,
      seed: cohort.seed,
      ownerGuidance: cohort.owner_guidance,
      ownerPolicy: cohort.synthetic_owner_policy,
      agents,
      wake,
      timedReviews: p?.timed_reviews ?? null,
    };
    const metrics = (
      await db.query(
        `SELECT count(*)::int calls, count(*) FILTER(WHERE status='unknown')::int "unknownCalls",count(*) FILTER(WHERE status='reserved')::int "reservedCalls",coalesce(sum(tokens),0)::text "allocatedTokens",coalesce(sum(tokens) FILTER(WHERE status='unknown'),0)::text "unknownAllocatedTokens",coalesce(sum(input_tokens),0)::text "reportedInputTokens",coalesce(sum(output_tokens),0)::text "reportedOutputTokens" FROM compute_ledger WHERE cohort_id=$1`,
        [id],
      )
    ).rows[0];
    const turns = (
      await db.query(
        `SELECT count(*)::int turns,count(*) FILTER(WHERE state='finished')::int finished,coalesce(sum(actions),0)::text "committedActions",count(*) FILTER(WHERE pending_command IS NOT NULL)::int "pendingCommands", count(*) FILTER(WHERE code='WAIT')::int waits,count(*) FILTER(WHERE state='needs_owner')::int "needsOwner",count(*) FILTER(WHERE state='cancelled')::int cancelled,count(*)::int "queueDelaySamples",count(finished_at)::int "finishedDurationSamples",avg(extract(epoch FROM (started_at-due_at))*1000)::float8 "meanQueueDelayMs",avg(extract(epoch FROM (finished_at-started_at))*1000) FILTER(WHERE finished_at IS NOT NULL)::float8 "meanFinishedDurationMs" FROM turns WHERE cohort_id=$1`,
        [id],
      )
    ).rows[0];
    const detail = (
      await db.query(
        "SELECT count(*)::int events,count(*) FILTER(WHERE detail_cipher IS NOT NULL AND occurred_at>=$2)::int retained FROM turn_events WHERE cohort_id=$1",
        [id, new Date(this.store.now().getTime() - 30 * 86400000)],
      )
    ).rows[0];
    return {
      cohortId: id,
      name: cohort.name,
      studyId: null,
      profile,
      profileProvenance: profile ? "selected" : "inferred_legacy_family_only",
      configuration,
      configurationDigest: digest(configuration),
      state: cohort.state,
      agents: agents.length,
      anchorAt: cohort.anchor_at,
      observationConsent: cohort.observation_consent,
      metrics: { ...metrics, ...turns },
      coverage: {
        details: cohort.observation_consent ? "retained_only" : "withheld",
        events: detail.events,
        retainedDetailedEvents: cohort.observation_consent ? detail.retained : 0,
        materialOutcomes: "unmeasured; command counts do not establish goal completion",
        environment: bindings.length ? "recorded bindings" : "not bound; historical environment unavailable",
      },
    };
  }
  async compareCohorts(rawIds: string[]) {
    const ids = idsSchema.refine((x) => x.length >= 2).parse(rawIds);
    return transaction(this.store.pool, async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const cohorts = [];
      for (const id of ids) cohorts.push(await this.cohort(id, db));
      return {
        schemaVersion: "fleet.cohort-comparison.v1",
        asOf: this.store.now().toISOString(),
        cohorts,
        coverage:
          "Existing independent cohort ownership is unchanged. Same-world players interact and are not independent replicas. No universal intelligence score or budget normalization is inferred.",
      };
    });
  }
  async link(input: unknown) {
    const request = Link.parse(input),
      requestDigest = digest(request);
    return transaction(this.store.pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [request.requestId]);
      const old = (await db.query("SELECT request_digest FROM platform_comparisons WHERE id=$1", [request.requestId]))
        .rows[0];
      if (old) {
        if (old.request_digest !== requestDigest) throw new FleetError("COMPARISON_REQUEST_CONFLICT");
        return { id: request.requestId };
      }
      // Serialize snapshots with existing configuration/enrollment writers.
      await db.query("SELECT id FROM cohorts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [request.cohortIds]);
      const snapshots = [];
      for (const id of request.cohortIds)
        snapshots.push({ cohortId: id, digest: (await this.cohort(id, db)).configurationDigest });
      await db.query(
        "INSERT INTO platform_comparisons(id,name,design,cohort_ids,snapshots,request_digest,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          request.requestId,
          request.name,
          request.design,
          request.cohortIds,
          JSON.stringify(snapshots),
          requestDigest,
          this.store.now(),
        ],
      );
      return { id: request.requestId };
    });
  }
  async list() {
    return (
      await this.store.pool.query(
        "SELECT id,name,design,cohort_ids FROM platform_comparisons ORDER BY created_at DESC,id LIMIT 100",
      )
    ).rows;
  }
  async inspectComparison(id: string) {
    const row = (await this.store.pool.query("SELECT * FROM platform_comparisons WHERE id=$1", [z.uuid().parse(id)]))
      .rows[0];
    if (!row) throw new FleetError("NOT_FOUND");
    const report = await this.compareCohorts(row.cohort_ids);
    return {
      ...report,
      id,
      name: row.name,
      design: row.design,
      cohorts: report.cohorts.map((c) => ({
        ...c,
        configurationDrift: !row.snapshots.some(
          (s: { cohortId: string; digest: string }) => s.cohortId === c.cohortId && s.digest === c.configurationDigest,
        ),
      })),
    };
  }
  async exportReport(rawScope: "private" | "shareable", rawIds: string[]) {
    const scope = z.enum(["private", "shareable"]).parse(rawScope),
      ids = idsSchema.parse(rawIds);
    const rows = await transaction(this.store.pool, async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const rows = [];
      for (const id of ids) rows.push(await this.cohort(id, db));
      return rows;
    });
    const cohorts = [];
    let bytes = 0;
    for (const [i, row] of rows.entries()) {
      if (scope === "shareable") {
        cohorts.push({
          group: `group-${i + 1}`,
          profile:
            row.profile &&
            this.store.architectures
              .list()
              .some((m) => m.ref.id === row.profile?.id && m.ref.version === row.profile.version)
              ? row.profile
              : null,
          state: row.state,
          agents: row.agents,
          environmentVersions: row.configuration.environment.map((b) => ({
            id: b.environment_id,
            version: b.environment_version,
          })),
          configurationCoverage:
            "Provider/model, allowances and owner intent omitted from shareable aggregates; review private configurations before interpreting differences.",
          metrics: row.metrics,
          coverage: row.coverage,
        });
        continue;
      }
      const runs = [];
      const turns = (
        await this.store.pool.query(
          "SELECT id FROM turns WHERE cohort_id=$1 ORDER BY started_at DESC,id DESC LIMIT 20",
          [row.cohortId],
        )
      ).rows;
      if (row.observationConsent)
        for (const turn of turns) {
          const run = await new Observability(this.store).run(turn.id);
          const size = Buffer.byteLength(JSON.stringify(run));
          if (size > 524288 || bytes + size > 8388608) {
            runs.push({ turnId: turn.id, omitted: "export byte limit" });
            continue;
          }
          bytes += size;
          runs.push({ ...run, evidence: evidenceChain(run.turn?.events ?? []) });
        }
      const consent = (await this.store.cohort(row.cohortId)).observation_consent;
      cohorts.push({
        ...row,
        observationConsent: consent,
        coverage: {
          ...row.coverage,
          details: consent ? "retained_only" : "withheld",
          exportedTurns: consent ? runs.length : 0,
          turnLimit: 20,
        },
        runs: consent ? runs : [],
      });
    }
    return {
      schemaVersion: "fleet.operation-report.v1",
      scope,
      asOf: this.store.now().toISOString(),
      cohorts,
      definitions: operationDefinitions,
      coverage: {
        history: "Lifetime counters; original provenance may be unavailable. No reconstruction of missing detail.",
        evidence: "Recorded playback only; export performs no inference, game reads or message acknowledgments.",
        materialOutcomes:
          "Unmeasured unless separate environment-authoritative evidence is supplied; no causal ranking.",
        shareable:
          "Allowlisted aggregate fields; excludes actor/cohort IDs,names,config digests,models,prompts,messages,source refs and private continuity.",
      },
    };
  }
}
