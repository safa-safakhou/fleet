import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import { type ArtifactRef, canonical, type RunScope } from "../contracts.js";
import type { ArtifactStore } from "./artifacts.js";
import { CoverageService } from "./coverage.js";
import { EvidenceRepository } from "./repository.js";
import { type CompletenessManifest, EventKinds, type EvidenceEvent } from "./types.js";
/** Constructed by the authenticated host; never deserialize authority from request JSON. */
export type ResearchPrincipal = { sessionHash: string; agentIds?: readonly string[]; cohortIds?: readonly string[] };
export type RunSnapshot = {
  version: "fleet.snapshot/v1";
  id: string;
  runId: string;
  maximumOrdinal: string;
  total: number;
  createdAt: string;
  expiresAt: string;
  provenance: string;
  manifestDigest: string;
  manifest: unknown | null;
  manifestAvailability: "sealed" | "unavailable";
  scopes: RunScope[];
  coverage: CompletenessManifest;
  native: {
    allocations: {
      id: string;
      status: string;
      purpose: string;
      inputTokens: string | null;
      outputTokens: string | null;
      createdAt?: string;
      reservedTokens?: string;
      requestMetrics?: Record<string, unknown>;
      responseMetrics?: Record<string, unknown>;
    }[];
    commands: { id: string; status: string; createdAt?: string }[];
    attempts?: {
      id: string;
      taskId: string | null;
      startedAt: string;
      finishedAt: string | null;
      actions: number;
      code: string | null;
    }[];
    cohorts?: { id: string; createdAt: string; completedAt: string | null; state?: string }[];
  };
  metricDefinitions: { id: string; definition: string }[];
};
const Query = z
  .object({
    snapshotId: z.uuid(),
    cursor: z.string().max(12000).optional(),
    limit: z.number().int().min(1).max(500).default(200),
    kind: z.enum(EventKinds).optional(),
    streamId: z.string().max(120).optional(),
  })
  .strict();
export class RunInspection {
  constructor(
    readonly store: Store,
    readonly artifacts: ArtifactStore,
  ) {}
  async authorize(runId: string, principal: ResearchPrincipal, db: Pick<PoolClient, "query"> = this.store.pool) {
    if (
      !principal.sessionHash ||
      !(
        await db.query("SELECT 1 FROM operator_sessions WHERE hash=$1 AND expires_at>$2", [
          principal.sessionHash,
          this.store.now(),
        ])
      ).rowCount
    )
      throw new FleetError("EVIDENCE_FORBIDDEN", true);
    const run = (
      await db.query(
        "SELECT r.*,c.observation_consent,c.observation_consent_version::text consent_version FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (!run) throw new FleetError("EVIDENCE_RUN_NOT_FOUND", true);
    if (
      (principal.agentIds && !principal.agentIds.includes(run.agent_id)) ||
      (principal.cohortIds && !principal.cohortIds.includes(run.cohort_id))
    )
      throw new FleetError("EVIDENCE_FORBIDDEN", true);
    if (!run.observation_consent) throw new FleetError("EVIDENCE_WITHHELD", true);
    return run;
  }
  async runsForTurn(turnId: string, principal: ResearchPrincipal) {
    if (
      !(
        await this.store.pool.query("SELECT 1 FROM operator_sessions WHERE hash=$1 AND expires_at>$2", [
          principal.sessionHash,
          this.store.now(),
        ])
      ).rowCount
    )
      throw new FleetError("EVIDENCE_FORBIDDEN", true);
    const rows = (
      await this.store.pool.query(
        "SELECT DISTINCT r.run_id,r.provenance FROM research_evidence_scopes s JOIN research_runs r ON r.run_id=s.run_id WHERE s.turn_id=$1 ORDER BY r.run_id LIMIT 201",
        [z.uuid().parse(turnId)],
      )
    ).rows;
    if (rows.length > 200) throw new FleetError("EVIDENCE_REFERENCE_QUOTA", true);
    for (const r of rows) await this.authorize(r.run_id, principal);
    return rows.map((r) => ({ runId: r.run_id as string, provenance: r.provenance as string }));
  }
  async snapshot(runId: string, principal: ResearchPrincipal): Promise<RunSnapshot> {
    return transaction(this.store.pool, async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const run = await this.authorize(runId, principal, db),
        id = randomUUID(),
        now = this.store.now();
      const scopes = (
        await db.query("SELECT scope FROM research_evidence_scopes WHERE run_id=$1 ORDER BY operation_id,epoch", [
          runId,
        ])
      ).rows.map((r) => r.scope as RunScope);
      const turns = scopes.map((s) => s.turnId),
        manifest =
          (await db.query("SELECT manifest FROM research_manifests WHERE digest=$1", [run.manifest_digest])).rows[0]
            ?.manifest ?? null;
      const allocations = (
        await db.query(
          `SELECT id,status,COALESCE((SELECT e.event->'attributes'->>'purpose' FROM research_events e WHERE e.run_id=$2 AND e.event->'attributes'->>'allocationId'=compute_ledger.id::text AND e.event->'attributes' ? 'purpose' ORDER BY e.ordinal LIMIT 1),request_metrics->>'purpose','unavailable') purpose,input_tokens::text "inputTokens",output_tokens::text "outputTokens",created_at "createdAt",tokens::text "reservedTokens",request_metrics "requestMetrics",response_metrics "responseMetrics" FROM compute_ledger WHERE turn_id=ANY($1::uuid[]) ORDER BY id`,
          [turns, runId],
        )
      ).rows;
      const commands = (
        await db.query(
          "SELECT command_id id,state status FROM platform_commands WHERE turn_id=ANY($1::uuid[]) UNION SELECT command_id id,'confirmed' status FROM command_resolutions WHERE turn_id=ANY($1::uuid[]) AND command_id NOT IN (SELECT command_id FROM platform_commands) UNION SELECT pending_command id,'pending' status FROM turns WHERE id=ANY($1::uuid[]) AND pending_command IS NOT NULL AND pending_command NOT IN (SELECT command_id FROM platform_commands) AND pending_command NOT IN (SELECT command_id FROM command_resolutions)",
          [turns],
        )
      ).rows;
      const attempts = (
        await db.query(
          'SELECT t.id,c.task_id "taskId",t.started_at "startedAt",t.finished_at "finishedAt",t.actions,t.code FROM turns t LEFT JOIN platform_task_claims c ON c.turn_id=t.id WHERE t.id=ANY($1::uuid[]) ORDER BY t.id',
          [turns],
        )
      ).rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      }));
      const cohortRows = (await db.query("SELECT id,created_at,state FROM cohorts WHERE id=$1", [run.cohort_id])).rows;
      const cohorts = cohortRows.map((r) => ({
        id: r.id,
        createdAt: r.created_at.toISOString(),
        completedAt: null,
        state: r.state,
      }));
      const commandTimes = (
        await db.query("SELECT command_id id,created_at FROM platform_commands WHERE turn_id=ANY($1::uuid[])", [turns])
      ).rows;
      const body: RunSnapshot = {
        version: "fleet.snapshot/v1",
        id,
        runId,
        maximumOrdinal: String(run.next_ordinal),
        total: (
          await db.query("SELECT count(*)::int n FROM research_events WHERE run_id=$1 AND ordinal<=$2", [
            runId,
            run.next_ordinal,
          ])
        ).rows[0].n,
        createdAt: now.toISOString(),
        expiresAt: new Date(Math.min(now.getTime() + 3600000, new Date(run.expires_at).getTime())).toISOString(),
        provenance: run.provenance,
        manifestDigest: run.manifest_digest,
        manifest,
        manifestAvailability: manifest ? "sealed" : "unavailable",
        scopes,
        coverage: await new CoverageService(this.store).reconcile(runId, String(run.next_ordinal), db),
        native: {
          allocations: allocations.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
          commands: commands.map((r) => ({
            ...r,
            ...(commandTimes.find((c) => c.id === r.id)?.created_at
              ? { createdAt: commandTimes.find((c) => c.id === r.id)!.created_at.toISOString() }
              : {}),
          })),
          attempts,
          cohorts,
        },
        metricDefinitions: [
          {
            id: "coverage",
            definition:
              "Required native request/dispatch/result records reconciled against allocation and command identities at snapshot creation; no model quality claim.",
          },
          {
            id: "bytes",
            definition:
              "Expected and retained complete plaintext bytes in referenced artifact manifests; tombstones are gaps.",
          },
        ],
      };
      await db.query(
        "INSERT INTO research_snapshots(id,run_id,session_hash,consent_version,maximum_ordinal,body,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [id, runId, principal.sessionHash, run.consent_version, body.maximumOrdinal, body, now, body.expiresAt],
      );
      return body;
    });
  }
  async retained(runId: string, principal: ResearchPrincipal, id: string): Promise<RunSnapshot> {
    const run = await this.authorize(runId, principal);
    const row = (
      await this.store.pool.query("SELECT * FROM research_snapshots WHERE id=$1 AND run_id=$2 AND session_hash=$3", [
        z.uuid().parse(id),
        runId,
        principal.sessionHash,
      ])
    ).rows[0];
    if (!row) throw new FleetError("EVIDENCE_SNAPSHOT_INVALID", true);
    if (String(row.consent_version) !== run.consent_version) throw new FleetError("EVIDENCE_WITHHELD", true);
    if (new Date(row.expires_at) <= this.store.now()) throw new FleetError("EVIDENCE_SNAPSHOT_EXPIRED", true);
    return row.body;
  }
  async events(runId: string, principal: ResearchPrincipal, query: z.input<typeof Query>) {
    const q = Query.parse(query),
      snap = await this.retained(runId, principal, q.snapshotId),
      filter = { kind: q.kind ?? null, streamId: q.streamId ?? null };
    let after = "0";
    if (q.cursor) {
      try {
        const parts = q.cursor.split(".");
        if (
          parts.length !== 4 ||
          parts[0] !== "v1" ||
          parts.slice(1).some((p) => Buffer.from(p, "base64").toString("base64") !== p)
        )
          throw Error();
        const c = this.store.vault.decrypt<{ snapshotId: string; filter: typeof filter; after: string }>(
          q.cursor,
          `evidence-cursor:v1:${runId}:${principal.sessionHash}`,
        );
        if (
          c.snapshotId !== snap.id ||
          canonical(c.filter) !== canonical(filter) ||
          !/^(0|[1-9][0-9]*)$/.test(c.after) ||
          BigInt(c.after) > BigInt(snap.maximumOrdinal)
        )
          throw Error();
        after = c.after;
      } catch {
        throw new FleetError("EVIDENCE_CURSOR_INVALID", true);
      }
    }
    const page = await new EvidenceRepository(this.store).page(snap.scopes[0], {
      limit: q.limit,
      after,
      maximumOrdinal: snap.maximumOrdinal,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.streamId ? { streamId: q.streamId } : {}),
    });
    return {
      ...page,
      snapshotId: snap.id,
      nextCursor: page.nextAfter
        ? this.store.vault.encrypt(
            { snapshotId: snap.id, filter, after: page.nextAfter },
            `evidence-cursor:v1:${runId}:${principal.sessionHash}`,
          )
        : null,
    };
  }
  async event(
    runId: string,
    principal: ResearchPrincipal,
    snapshotId: string,
    eventId: string,
  ): Promise<EvidenceEvent> {
    const snap = await this.retained(runId, principal, snapshotId);
    const row = (
      await this.store.pool.query(
        "SELECT event FROM research_events WHERE run_id=$1 AND (id=$2 OR event->'artifacts' @> $4::jsonb) AND ordinal<=$3 ORDER BY ordinal LIMIT 1",
        [runId, z.uuid().parse(eventId), snap.maximumOrdinal, JSON.stringify([{ id: eventId }])],
      )
    ).rows[0];
    if (!row) throw new FleetError("EVIDENCE_EVENT_UNAVAILABLE", true);
    await this.retained(runId, principal, snapshotId);
    return row.event;
  }
  async artifactChunk(
    runId: string,
    principal: ResearchPrincipal,
    snapshotId: string,
    artifactId: string,
    index: number,
  ) {
    z.number().int().min(0).max(1000000).parse(index);
    const { ref, scope } = await this.artifactReference(runId, principal, artifactId, snapshotId);
    const record = await this.artifacts.record(scope, artifactId);
    if (index >= Number(ref.chunks)) throw new FleetError("ARTIFACT_CHUNK_UNAVAILABLE", true);
    let current = 0;
    for await (const chunk of this.artifact(runId, principal, artifactId, snapshotId)) {
      if (current++ !== index) continue;
      if (chunk.length > 1048576) throw new FleetError("ARTIFACT_CHUNK_INVALID", true);
      await this.retained(runId, principal, snapshotId);
      return {
        index,
        chunks: Number(ref.chunks),
        bytes: chunk.length,
        totalBytes: ref.bytes,
        body: Buffer.from(chunk).toString("base64"),
        complete: Number(ref.chunks) === 1,
        contentType: ref.contentType,
        originRunId: runId,
        expiresAt: new Date(record.expires_at).toISOString(),
      };
    }
    throw new FleetError("ARTIFACT_CHUNK_UNAVAILABLE", true);
  }
  async sourceChunk(
    runId: string,
    principal: ResearchPrincipal,
    snapshotId: string,
    viaArtifactId: string,
    sourceId: string,
    index: number,
  ) {
    z.number().int().min(0).max(1000000).parse(index);
    await this.artifactChunk(runId, principal, snapshotId, z.uuid().parse(viaArtifactId), 0);
    const linked = (
      await this.store.pool.query(
        "SELECT a.* FROM research_artifact_sources s JOIN research_artifacts a ON a.id=s.source_artifact_id WHERE s.artifact_id=$1 AND s.source_artifact_id=$2",
        [viaArtifactId, z.uuid().parse(sourceId)],
      )
    ).rows[0];
    if (!linked) throw new FleetError("ARTIFACT_SOURCE_UNAVAILABLE", true);
    await this.authorize(linked.run_id, principal);
    const ref = {
      id: linked.id,
      contentType: linked.content_type,
      bytes: String(linked.bytes),
      chunks: String(linked.chunks.length),
      ciphertextDigest: linked.ciphertext_digest,
      privacyClass: linked.privacy_class,
      retentionClass: linked.retention_class,
    };
    if (index >= linked.chunks.length) throw new FleetError("ARTIFACT_CHUNK_UNAVAILABLE", true);
    let current = 0;
    for await (const chunk of this.artifacts.read(linked.scope, ref)) {
      if (current++ !== index) continue;
      await this.retained(runId, principal, snapshotId);
      await this.authorize(linked.run_id, principal);
      return {
        index,
        chunks: linked.chunks.length,
        bytes: chunk.length,
        totalBytes: ref.bytes,
        body: Buffer.from(chunk).toString("base64"),
        complete: linked.chunks.length === 1,
        contentType: ref.contentType,
        originRunId: linked.run_id as string,
        expiresAt: new Date(linked.expires_at).toISOString(),
      };
    }
    throw new FleetError("ARTIFACT_CHUNK_UNAVAILABLE", true);
  }
  async artifactReference(
    runId: string,
    principal: ResearchPrincipal,
    id: string,
    snapshotId: string,
  ): Promise<{ scope: RunScope; ref: ArtifactRef }> {
    const snap = await this.retained(runId, principal, snapshotId);
    const row = (
      await this.store.pool.query(
        "SELECT event FROM research_events WHERE run_id=$1 AND ordinal<=$2 AND event->'artifacts' @> $3::jsonb ORDER BY ordinal LIMIT 1",
        [runId, snap.maximumOrdinal, JSON.stringify([{ id }])],
      )
    ).rows[0];
    const event = row?.event as EvidenceEvent | undefined,
      ref = event?.artifacts.find((a) => a.id === id);
    if (!event || !ref) throw new FleetError("ARTIFACT_SCOPE_MISMATCH", true);
    return { scope: event.scope, ref };
  }
  async *artifact(
    runId: string,
    principal: ResearchPrincipal,
    id: string,
    snapshotId: string,
  ): AsyncIterable<Uint8Array> {
    const { scope, ref } = await this.artifactReference(runId, principal, id, snapshotId);
    for await (const chunk of this.artifacts.read(scope, ref)) {
      await this.retained(runId, principal, snapshotId);
      yield chunk;
    }
  }
  async lineage(runId: string, principal: ResearchPrincipal, snapshotId: string, limit = 200) {
    z.number().int().min(1).max(500).parse(limit);
    const snap = await this.retained(runId, principal, snapshotId);
    const rows = (
      await this.store.pool.query(
        "SELECT event FROM research_events WHERE run_id=$1 AND ordinal<=$2 ORDER BY ordinal LIMIT $3",
        [runId, snap.maximumOrdinal, limit],
      )
    ).rows.map((r) => r.event as EvidenceEvent);
    const nodes = rows.map((e) => ({
      id: e.id,
      streamId: e.streamId,
      sequence: e.sequence,
      kind: e.kind,
      parents: e.parentIds,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
    }));
    const ids = new Set(nodes.map((n) => n.id));
    return {
      snapshotId,
      total: snap.total,
      omitted: snap.total - nodes.length,
      nodes,
      unresolvedOrOutsidePage: [...new Set(nodes.flatMap((n) => n.parents.filter((p) => !ids.has(p))))],
      ordering: "Per-stream sequence and explicit parent links; ordinal is an ingestion locator.",
    };
  }
}
