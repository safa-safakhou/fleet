import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import { canonical, digest } from "../contracts.js";
import type { RunManifestInput } from "../manifests/compiler.js";
import { MetricCatalog } from "../metrics/catalog.js";
import type { MetricRecord, MetricRepository } from "../metrics/repository.js";
import type { MetricSet } from "../metrics/types.js";
import { type ExperimentSpec, ExperimentSpecSchema } from "./schema.js";
export type ExperimentUnit = {
  id: string;
  arm: string;
  worldId: string;
  sessionId: string;
  pairId?: string;
  expectedRuns: string[];
  runs: { runId: string; snapshotId: string; metricId: string; metrics: MetricSet; configuration: unknown }[];
  missingRuns: string[];
  flags: string[];
  manifestDifferences: { runId: string; path: string; expected: unknown; actual: unknown }[];
};
export type ExperimentSnapshot = {
  version: "fleet.experiment-snapshot/v1";
  id: string;
  experimentId: string;
  spec: ExperimentSpec;
  units: ExperimentUnit[];
  digest: string;
  createdAt: string;
  expiresAt: string;
};
export class ExperimentRepository {
  readonly store;
  constructor(readonly metrics: MetricRepository) {
    this.store = metrics.inspection.store;
  }
  private async session(db: Pick<PoolClient, "query"> = this.store.pool) {
    if (
      !(
        await db.query("SELECT 1 FROM operator_sessions WHERE hash=$1 AND expires_at>$2", [
          this.metrics.principal.sessionHash,
          this.store.now(),
        ])
      ).rowCount
    )
      throw new FleetError("EXPERIMENT_FORBIDDEN", true);
  }
  private async cohort(id: string, db: Pick<PoolClient, "query"> = this.store.pool) {
    await this.session(db);
    const p = this.metrics.principal;
    if (p.cohortIds && !p.cohortIds.includes(id)) throw new FleetError("EXPERIMENT_FORBIDDEN", true);
    if (
      p.agentIds &&
      (await db.query("SELECT 1 FROM agents WHERE cohort_id=$1 AND NOT(id=ANY($2::uuid[]))", [id, p.agentIds])).rowCount
    )
      throw new FleetError("EXPERIMENT_FORBIDDEN", true);
    const row = (
      await db.query("SELECT observation_consent,observation_consent_version::text version FROM cohorts WHERE id=$1", [
        id,
      ])
    ).rows[0];
    if (!row?.observation_consent) throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
    return row.version as string;
  }
  private cipher(value: unknown, id: string) {
    const body = canonical(value);
    if (Buffer.byteLength(body) > 1024 * 1024) throw new FleetError("EXPERIMENT_QUOTA", true);
    return this.store.vault.encrypt(value, `experiment:${id}`);
  }
  async create(raw: ExperimentSpec) {
    const spec = ExperimentSpecSchema.parse(raw);
    for (const id of [spec.primaryMetric, ...spec.secondaryMetrics]) new MetricCatalog().get(id);
    return transaction(this.store.pool, async (db) => {
      const cohorts = [...new Set(spec.units.map((u) => u.cohortId))].sort(),
        versions = [];
      for (const id of cohorts) versions.push([id, await this.cohort(id, db)]);
      await db.query("SELECT id FROM cohorts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [cohorts]);
      const hash = digest(spec),
        old = (await db.query("SELECT digest FROM research_experiments WHERE id=$1", [spec.id])).rows[0];
      if (old) {
        if (old.digest !== hash) throw new FleetError("EXPERIMENT_CONFLICT", true);
        return { id: spec.id, digest: hash };
      }
      await db.query("INSERT INTO research_experiments VALUES($1,$2,$3,$4,$5)", [
        spec.id,
        hash,
        this.cipher(spec, spec.id),
        this.store.now(),
        new Date(this.store.now().getTime() + 30 * 86400000),
      ]);
      for (const [id, version] of versions)
        await db.query("INSERT INTO research_experiment_cohorts VALUES($1,$2,$3)", [spec.id, id, version]);
      return { id: spec.id, digest: hash };
    });
  }
  async spec(id: string) {
    await this.session();
    const row = (await this.store.pool.query("SELECT * FROM research_experiments WHERE id=$1", [id])).rows[0];
    if (!row?.spec_cipher || new Date(row.expires_at) <= this.store.now())
      throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
    const links = (
      await this.store.pool.query("SELECT * FROM research_experiment_cohorts WHERE experiment_id=$1", [id])
    ).rows;
    if (!links.length) throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
    for (const c of links)
      if ((await this.cohort(c.cohort_id)) !== String(c.consent_version))
        throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
    return {
      spec: ExperimentSpecSchema.parse(this.store.vault.decrypt(row.spec_cipher, `experiment:${id}`)),
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
  async snapshot(id: string, runSnapshots: string[]): Promise<ExperimentSnapshot> {
    const declared = await this.spec(id),
      spec = declared.spec;
    if (runSnapshots.length > 1000 || new Set(runSnapshots).size !== runSnapshots.length)
      throw new FleetError("EXPERIMENT_INPUT_INVALID", true);
    const records: MetricRecord[] = [];
    for (const snapshotId of runSnapshots) {
      const row = (await this.store.pool.query("SELECT run_id FROM research_snapshots WHERE id=$1", [snapshotId]))
        .rows[0];
      if (!row || !spec.units.some((u) => u.runIds.includes(row.run_id)))
        throw new FleetError("EXPERIMENT_UNDECLARED_RUN", true);
      const snapshot = await this.metrics.inspection.retained(row.run_id, this.metrics.principal, snapshotId);
      if (records.some((r) => r.snapshot.runId === snapshot.runId))
        throw new FleetError("EXPERIMENT_DUPLICATE_RUN", true);
      const result = await this.metrics.compute(
        snapshot,
        [spec.primaryMetric, ...spec.secondaryMetrics],
        spec.window,
        spec.evaluator,
      );
      records.push(await this.metrics.get(result.id));
    }
    const units: ExperimentUnit[] = spec.units.map((unit) => {
      const matched = records.filter((r) => unit.runIds.includes(r.snapshot.runId)),
        flags: string[] = [],
        manifestDifferences: ExperimentUnit["manifestDifferences"] = [];
      const baseline = spec.units.find((u) => u.arm === spec.baseline)!;
      if (canonical(unit.limits) !== canonical(baseline.limits)) flags.push("BUDGET_MISMATCH");
      for (const row of matched) {
        const m = row.snapshot.manifest as RunManifestInput | null;
        const differs = (path: string, expected: unknown, actual: unknown) => {
          if (canonical(expected) !== canonical(actual))
            manifestDifferences.push({ runId: row.snapshot.runId, path, expected, actual });
        };
        differs("manifestDigest", unit.manifestDigest, row.snapshot.manifestDigest);
        differs("worldIncarnation", unit.worldId, m?.environment.worldIncarnation ?? null);
        differs("limits", unit.limits, m?.limits ?? null);
        if (m?.environment.worldIncarnation !== unit.worldId) flags.push("WORLD_MISMATCH");
        if (row.metrics.unresolvedUsage.allocations) flags.push("UNKNOWN_USAGE");
        if (row.snapshot.coverage.status !== "complete") flags.push("EVIDENCE_INCOMPLETE");
        if (Date.parse(row.snapshot.createdAt) < Date.parse(spec.window.end)) flags.push("CENSORED_HORIZON");
        if (
          row.snapshot.native.allocations.some(
            (c) => c.createdAt && Date.parse(c.createdAt) < Date.parse(declared.createdAt),
          )
        )
          flags.push("POSTHOC_REGISTRATION");
      }
      if (manifestDifferences.length) flags.push("MANIFEST_MISMATCH");
      const runs = matched.map((r) => ({
        runId: r.snapshot.runId,
        snapshotId: r.snapshot.id,
        metricId: r.id,
        metrics: r.metrics,
        configuration: r.snapshot.manifest,
      }));
      const missingRuns = unit.runIds.filter((id) => !runs.some((r) => r.runId === id));
      if (missingRuns.length) flags.push("MISSING_RUNS");
      return {
        id: unit.id,
        arm: unit.arm,
        worldId: unit.worldId,
        sessionId: unit.sessionId,
        ...(unit.pairId ? { pairId: unit.pairId } : {}),
        expectedRuns: unit.runIds,
        runs,
        missingRuns,
        flags: [...new Set(flags)].sort(),
        manifestDifferences,
      };
    });
    const snapshotId = randomUUID(),
      body = {
        version: "fleet.experiment-snapshot/v1" as const,
        id: snapshotId,
        experimentId: id,
        spec,
        units,
        createdAt: this.store.now().toISOString(),
        expiresAt: declared.expiresAt,
      };
    const result = { ...body, digest: digest(body) };
    await transaction(this.store.pool, async (db) => {
      await db.query("SELECT id FROM cohorts WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE", [
        [...new Set(spec.units.map((u) => u.cohortId))],
      ]);
      for (const c of (await db.query("SELECT * FROM research_experiment_cohorts WHERE experiment_id=$1", [id])).rows)
        if ((await this.cohort(c.cohort_id, db)) !== String(c.consent_version))
          throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
      await db.query("INSERT INTO research_experiment_snapshots VALUES($1,$2,$3,$4,$5,$6)", [
        snapshotId,
        id,
        result.digest,
        this.cipher(result, snapshotId),
        this.store.now(),
        result.expiresAt,
      ]);
      for (const r of records) {
        const source = (
          await db.query(
            "SELECT m.artifact_ref,LEAST(m.expires_at,a.expires_at) expires_at,a.status,a.purged FROM research_metric_snapshots m JOIN research_artifacts a ON a.id=(m.artifact_ref->>'id')::uuid WHERE m.id=$1 FOR SHARE OF a",
            [r.id],
          )
        ).rows[0];
        if (!source || source.status !== "complete" || source.purged || new Date(source.expires_at) <= this.store.now())
          throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
        await db.query("INSERT INTO research_experiment_inputs VALUES($1,$2,$3)", [
          snapshotId,
          r.id,
          source.artifact_ref.id,
        ]);
        await db.query("UPDATE research_experiment_snapshots SET expires_at=LEAST(expires_at,$2) WHERE id=$1", [
          snapshotId,
          source.expires_at,
        ]);
      }
    });
    return this.retained(snapshotId);
  }
  async retained(id: string): Promise<ExperimentSnapshot> {
    await this.session();
    const row = (await this.store.pool.query("SELECT * FROM research_experiment_snapshots WHERE id=$1", [id])).rows[0];
    if (!row?.body_cipher || new Date(row.expires_at) <= this.store.now())
      throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
    await this.spec(row.experiment_id);
    for (const input of (
      await this.store.pool.query("SELECT metric_id FROM research_experiment_inputs WHERE snapshot_id=$1", [id])
    ).rows) {
      try {
        await this.metrics.get(input.metric_id);
      } catch (error) {
        if (
          error instanceof FleetError &&
          [
            "ARTIFACT_EXPIRED",
            "ARTIFACT_WITHHELD",
            "ARTIFACT_INTEGRITY",
            "EVIDENCE_WITHHELD",
            "METRIC_SNAPSHOT_UNAVAILABLE",
          ].includes(error.code)
        ) {
          await this.store.pool.query("UPDATE research_experiment_snapshots SET body_cipher=NULL WHERE id=$1", [id]);
          throw new FleetError("EXPERIMENT_UNAVAILABLE", true);
        }
        throw error;
      }
    }
    return this.store.vault.decrypt<ExperimentSnapshot>(row.body_cipher, `experiment:${id}`);
  }
}
