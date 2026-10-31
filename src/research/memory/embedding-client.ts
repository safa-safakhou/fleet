import { performance } from "node:perf_hooks";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "../../db.js";
import { FleetError } from "../../domain.js";
import { canonical, digest, type RunScope } from "../contracts.js";
import { ManifestRepository } from "../manifests/repository.js";
import type { MemoryRepository } from "./repository.js";
import { type EmbeddingIdentity, RetrievalService, validateVector } from "./retrieval.js";
export const EmbeddingInputSchema = z.discriminatedUnion("mode", [
  z.object({ key: z.string().min(1).max(200), mode: z.literal("query"), text: z.string().min(1).max(16384) }).strict(),
  z
    .object({
      key: z.string().min(1).max(200),
      mode: z.literal("document"),
      memoryId: z.uuid(),
      version: z.string().regex(/^[1-9][0-9]*$/),
    })
    .strict(),
]);
export type EmbeddingInput = z.infer<typeof EmbeddingInputSchema>;
export type EmbeddingResult = {
  identity: EmbeddingIdentity;
  vectors: number[][];
  usage: { purpose: "embedding"; cpuMs: number; durationMs: number; items: number };
};
export interface EmbeddingCompute {
  readonly identity: EmbeddingIdentity;
  embed(texts: string[], mode: "query" | "document"): Promise<EmbeddingResult>;
}
/** Trusted compute installation only. Workers cannot supply endpoints, model paths or vectors. */
export class EmbeddingPort {
  private static busy = false;
  constructor(
    readonly memory: MemoryRepository,
    private readonly compute?: EmbeddingCompute,
  ) {}
  private async record(
    scope: RunScope,
    key: string,
    kind: "embedding.request" | "embedding.result",
    body: unknown,
    db: PoolClient,
    parents: string[] = [],
  ) {
    const event = await this.memory.captureSession.emit(
      scope,
      kind,
      body,
      { purpose: "embedding" },
      { required: true, db, parents },
    );
    if (!event) throw new FleetError("EVIDENCE_UNAVAILABLE", true);
    await db.query(
      "INSERT INTO research_embedding_job_artifacts SELECT $1,$2,(a->>'id')::uuid FROM research_events e,jsonb_array_elements(e.event->'artifacts') a WHERE e.id=$3",
      [scope.operationId, key, event.id],
    );
    return event;
  }
  async expire() {
    await this.memory.store.pool.query(
      "UPDATE research_embedding_jobs SET status='expired',input_digest=NULL,result_cipher=NULL,memory_id=NULL,source_version=NULL WHERE expires_at<=$1 AND status<>'expired'",
      [this.memory.store.now()],
    );
  }
  async embed(scope: RunScope, raw: EmbeddingInput): Promise<EmbeddingResult> {
    const input = EmbeddingInputSchema.parse(raw),
      manifest = await new ManifestRepository(this.memory.store.pool).load(scope.manifestDigest);
    const identity = manifest.memory.embedding;
    if (!identity || !this.compute) throw new FleetError("LOCAL_EMBEDDING_UNAVAILABLE", true);
    if (canonical(identity) !== canonical(this.compute.identity)) throw new FleetError("EMBEDDING_INCOMPATIBLE", true);
    const policy = manifest.memory.indexConsentRef ?? "";
    await this.expire();
    const reserved = await transaction(this.memory.store.pool, async (db) => {
      const c = await this.memory.indexPolicy.context(scope, db);
      await this.memory.indexPolicy.assertAllowed(scope, policy, db);
      // Serialize reservations and enforce an operation-level ceiling, independently of worker retries.
      await db.query("SELECT operation_id FROM research_operations WHERE operation_id=$1 FOR UPDATE", [
        scope.operationId,
      ]);
      const record = input.mode === "document" ? (await this.memory.get(scope, [input.memoryId], db))[0] : undefined;
      if (input.mode === "document" && (!record || record.version !== input.version))
        throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      const text = record?.text ?? (input.mode === "query" ? input.text : "");
      if (Buffer.byteLength(text) > 65536) throw new FleetError("EMBEDDING_INPUT_LIMIT", true);
      const fingerprint = digest({ operation: scope.operationId, namespace: c.namespace, input, identity, text });
      const row = (
        await db.query("SELECT * FROM research_embedding_jobs WHERE operation_id=$1 AND logical_key=$2", [
          scope.operationId,
          input.key,
        ])
      ).rows[0];
      const aad = `embedding:${scope.operationId}:${input.key}:${c.namespace}`;
      if (row) {
        if (row.status === "expired") throw new FleetError("EMBEDDING_JOB_EXPIRED", true);
        if (row.input_digest !== fingerprint) throw new FleetError("EMBEDDING_INPUT_CONFLICT", true);
        if (row.status !== "completed" || !row.result_cipher) throw new FleetError("EMBEDDING_JOB_UNKNOWN", true);
        return {
          cached: this.memory.store.vault.decrypt(row.result_cipher, aad) as EmbeddingResult,
          text,
          aad,
          expiresAt: new Date(row.expires_at),
        };
      }
      if (EmbeddingPort.busy) throw new FleetError("EMBEDDING_QUEUE_FULL", true);
      if (
        (
          await db.query("SELECT count(*)::int n FROM research_embedding_jobs WHERE operation_id=$1", [
            scope.operationId,
          ])
        ).rows[0].n >= 8
      )
        throw new FleetError("EMBEDDING_BUDGET_EXHAUSTED", true);
      const expiresAt = new Date(
        Math.min(this.memory.store.now().getTime() + 30 * 86400000, record ? Date.parse(record.expiresAt) : Infinity),
      );
      await db.query(
        "INSERT INTO research_embedding_jobs(operation_id,logical_key,namespace,cohort_id,policy_id,original_epoch,input_digest,memory_id,source_version,status,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'unknown',$10,$11)",
        [
          scope.operationId,
          input.key,
          c.namespace,
          c.cohortId,
          policy,
          scope.operationEpoch,
          fingerprint,
          record?.id ?? null,
          record?.version ?? null,
          this.memory.store.now(),
          expiresAt,
        ],
      );
      return { cached: undefined, text, aad, expiresAt };
    });
    if (reserved.cached) {
      if (input.mode === "document")
        await new RetrievalService(this.memory).indexVector(
          scope,
          input.memoryId,
          reserved.cached.vectors[0],
          identity,
          input.version,
        );
      return reserved.cached;
    }
    if (EmbeddingPort.busy) throw new FleetError("EMBEDDING_QUEUE_FULL", true);
    // No external compute inside a transaction. Unknown reservations are never automatically repeated.
    EmbeddingPort.busy = true;
    const started = performance.now();
    let usage: EmbeddingResult["usage"] | undefined;
    try {
      const event = await transaction(this.memory.store.pool, async (db) => {
        await this.memory.indexPolicy.assertAllowed(scope, policy, db);
        return this.record(scope, input.key, "embedding.request", { input, identity }, db);
      });
      const result = await this.compute.embed([reserved.text], input.mode);
      if (canonical(result.identity) !== canonical(identity) || result.vectors.length !== 1)
        throw new FleetError("EMBEDDING_INCOMPATIBLE", true);
      validateVector(result.vectors[0], identity);
      if (
        result.usage.purpose !== "embedding" ||
        result.usage.items !== 1 ||
        !Number.isFinite(result.usage.cpuMs) ||
        result.usage.cpuMs < 0 ||
        !Number.isFinite(result.usage.durationMs) ||
        result.usage.durationMs < 0
      )
        throw new FleetError("EMBEDDING_USAGE_INVALID", true);
      usage = result.usage;
      // Record known compute cost even when consent/lease was lost during computation.
      await this.memory.store.pool.query(
        "UPDATE research_embedding_jobs SET cpu_ms=$3,duration_ms=$4 WHERE operation_id=$1 AND logical_key=$2",
        [scope.operationId, input.key, usage.cpuMs, performance.now() - started],
      );
      await transaction(this.memory.store.pool, async (db) => {
        await this.memory.indexPolicy.assertAllowed(scope, policy, db);
        const record = input.mode === "document" ? (await this.memory.get(scope, [input.memoryId], db))[0] : undefined;
        if (
          reserved.expiresAt <= this.memory.store.now() ||
          (input.mode === "document" && (!record || record.version !== input.version))
        )
          throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
        const updated = await db.query(
          "UPDATE research_embedding_jobs SET status='completed',result_cipher=$3 WHERE operation_id=$1 AND logical_key=$2 AND status='unknown' AND expires_at>$4",
          [
            scope.operationId,
            input.key,
            this.memory.store.vault.encrypt(result, reserved.aad),
            this.memory.store.now(),
          ],
        );
        if (!updated.rowCount) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
        await this.record(scope, input.key, "embedding.result", result, db, event ? [event.id] : []);
      });
      // Projection update checks the current source version again inside its own scoped transaction.
      if (input.mode === "document")
        await new RetrievalService(this.memory).indexVector(
          scope,
          input.memoryId,
          result.vectors[0],
          identity,
          input.version,
        );
      await this.memory.journal.assertCurrent(scope);
      return result;
    } catch (error) {
      await this.expire();
      await this.memory.captureSession.emit(
        scope,
        "embedding.failed",
        { usage: usage ?? null },
        { purpose: "embedding", outcome: "unknown" },
      );
      throw error;
    } finally {
      EmbeddingPort.busy = false;
    }
  }
}
