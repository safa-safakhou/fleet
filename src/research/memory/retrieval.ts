import { performance } from "node:perf_hooks";
import { z } from "zod";
import { FleetError } from "../../domain.js";
import { canonical, type RunScope } from "../contracts.js";
import type { RunManifestInput } from "../manifests/compiler.js";
import { reciprocalRankFusion } from "./fusion.js";
import type { MemoryRepository } from "./repository.js";
import { type MemoryRecord, textConfiguration } from "./schema.js";
export type EmbeddingIdentity = NonNullable<RunManifestInput["memory"]["embedding"]>;
export const QuerySchema = z
  .object({
    strategy: z.enum(["baseline-v1", "fts-v1", "vector-exact-v1", "rrf-v1"]),
    text: z.string().max(16384),
    language: z.string(),
    topK: z.number().int().min(1).max(100),
    vector: z.array(z.number().finite()).max(4096).optional(),
  })
  .strict();
export type RetrievalQuery = z.infer<typeof QuerySchema>;
export type RetrievalResult = {
  strategy: RetrievalQuery["strategy"];
  indexVersion: string;
  namespace: string;
  candidates: {
    id: string;
    score: number;
    lexicalRank: number | null;
    vectorRank: number | null;
    sourceRefs: string[];
  }[];
  selected: { record: MemoryRecord; score: number }[];
  omitted: { id: string; reason: string }[];
  coverage: { status: "complete" | "partial"; expected: number; recorded: number };
  durationMs: number;
  eventId?: string;
};
export function validateVector(vector: number[], identity: EmbeddingIdentity, expectedVersion?: string) {
  if (vector.length !== identity.dimension) throw new FleetError("EMBEDDING_INCOMPATIBLE", true);
  const norm = Math.hypot(...vector);
  if (
    !vector.every(Number.isFinite) ||
    norm === 0 ||
    !Number.isFinite(norm) ||
    (identity.normalization === "l2" && Math.abs(norm - 1) > 1e-4)
  )
    throw new FleetError("VECTOR_INVALID", true);
}
export class RetrievalService {
  constructor(readonly memory: MemoryRepository) {}
  private async vectorAvailable() {
    if (
      !(await this.memory.store.pool.query("SELECT 1 FROM pg_extension WHERE extname='vector' AND extversion='0.8.7'"))
        .rowCount
    )
      throw new FleetError("RETRIEVAL_STRATEGY_UNAVAILABLE", true);
  }
  async indexVector(
    scope: RunScope,
    id: string,
    vector: number[],
    identity: EmbeddingIdentity,
    expectedVersion?: string,
  ) {
    await this.vectorAvailable();
    await this.memory.indexPolicy.restricted(
      scope,
      (await this.manifest(scope)).memory.indexConsentRef ?? "",
      async (db) => {
        const manifest = await this.manifest(scope);
        if (canonical(manifest.memory.embedding) !== canonical(identity))
          throw new FleetError("EMBEDDING_INCOMPATIBLE", true);
        validateVector(vector, identity);
        const row = (await db.query("SELECT version FROM research_memory_projections WHERE memory_id=$1", [id]))
          .rows[0];
        if (!row || (expectedVersion && String(row.version) !== expectedVersion))
          throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
        await db.query("RESET ROLE");
        const updated = await db.query(
          "UPDATE research_memory_projections SET embedding=$2::vector,embedding_revision=$3,embedding_digest=$4,dimension=$5,normalization=$6 WHERE memory_id=$1 AND version=$7",
          [
            id,
            JSON.stringify(vector),
            identity.revision,
            identity.digest,
            identity.dimension,
            identity.normalization,
            row.version,
          ],
        );
        if (!updated.rowCount) throw new FleetError("MEMORY_SOURCE_UNAVAILABLE", true);
      },
    );
  }
  private async manifest(scope: RunScope) {
    const { ManifestRepository } = await import("../manifests/repository.js");
    return new ManifestRepository(this.memory.store.pool).load(scope.manifestDigest);
  }
  async search(scope: RunScope, raw: RetrievalQuery): Promise<RetrievalResult> {
    const started = performance.now(),
      q = QuerySchema.parse(raw),
      manifest = await this.manifest(scope);
    textConfiguration(q.language);
    if (
      q.language !== manifest.retrieval.language ||
      q.strategy !== manifest.retrieval.strategy ||
      q.topK > manifest.retrieval.topK
    )
      throw new FleetError("RETRIEVAL_POLICY_MISMATCH", true);
    const context = await import("./schema.js"),
      namespace = context.namespaceFor(scope, manifest);
    let indexedIds: string[] = [];
    let records: MemoryRecord[],
      lexical: { id: string; score: number }[] = [],
      vectors: { id: string; score: number }[] = [];
    if (q.strategy === "baseline-v1") {
      records = await this.memory.all(scope);
      const words =
        q.text
          .normalize("NFKC")
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) ?? [];
      lexical = records
        .map((r) => {
          const tokens =
            r.text
              .normalize("NFKC")
              .toLowerCase()
              .match(/[\p{L}\p{N}]+/gu) ?? [];
          return {
            id: r.id,
            score:
              words.reduce((sum, w) => sum + tokens.filter((t) => t === w).length, 0) +
              r.importance / 100 +
              1 / (10000 + Math.max(0, this.memory.store.now().getTime() - Date.parse(r.observedAt))),
          };
        })
        .sort(order);
    } else {
      const vectorMode = q.strategy !== "fts-v1";
      if (vectorMode) {
        await this.vectorAvailable();
        if (!manifest.memory.embedding || !q.vector) throw new FleetError("EMBEDDING_REQUIRED", true);
        validateVector(q.vector, manifest.memory.embedding);
      }
      const rows = await this.memory.indexPolicy.restricted(
        scope,
        manifest.memory.indexConsentRef ?? "",
        async (db) => {
          indexedIds = (
            await db.query("SELECT memory_id::text id FROM research_memory_projections ORDER BY memory_id LIMIT 501")
          ).rows.map((r) => r.id as string);
          if (indexedIds.length > 500) throw new FleetError("MEMORY_QUERY_LIMIT", true);
          const rows = (
            await db.query(
              vectorMode
                ? `SELECT memory_id::text id,version::text,ts_rank_cd(lexemes,plainto_tsquery($1::regconfig,$2))::float8 lexical_score ${vectorMode ? ",(1-(embedding <=> $3::vector))::float8 vector_score,embedding_revision,embedding_digest,dimension,normalization,embedding IS NOT NULL has_vector" : ""} FROM research_memory_projections ${vectorMode ? "" : "WHERE lexemes @@ plainto_tsquery($1::regconfig,$2)"} ORDER BY memory_id LIMIT 501`
                : "SELECT * FROM research_fts_candidates($1::regconfig,$2)",
              vectorMode
                ? [textConfiguration(q.language), q.text, JSON.stringify(q.vector)]
                : [textConfiguration(q.language), q.text],
            )
          ).rows;
          if (rows.length > 500) throw new FleetError("MEMORY_QUERY_LIMIT", true);
          return rows;
        },
      );
      if (
        vectorMode &&
        rows.some(
          (r) =>
            !r.has_vector ||
            r.embedding_revision !== manifest.memory.embedding!.revision ||
            r.embedding_digest !== manifest.memory.embedding!.digest ||
            r.dimension !== manifest.memory.embedding!.dimension ||
            r.normalization !== manifest.memory.embedding!.normalization,
        )
      )
        throw new FleetError("EMBEDDING_INDEX_INCOMPLETE", true);
      records = await this.memory.all(scope);
      if (rows.some((row) => !records.some((record) => record.id === row.id && record.version === row.version)))
        throw new FleetError("RETRIEVAL_SOURCE_CHANGED", true);
      lexical = rows
        .filter((r) => r.lexical_score > 0)
        .map((r) => ({ id: r.id, score: Number(r.lexical_score) }))
        .sort(order);
      if (vectorMode) vectors = rows.map((r) => ({ id: r.id, score: Number(r.vector_score) })).sort(order);
      await this.memory.indexPolicy.assertAllowed(scope, manifest.memory.indexConsentRef ?? "");
    }
    const ranked =
      q.strategy === "rrf-v1"
        ? reciprocalRankFusion([lexical.map((x) => x.id), vectors.map((x) => x.id)])
        : q.strategy === "vector-exact-v1"
          ? vectors
          : lexical;
    const map = new Map(records.map((r) => [r.id, r])),
      selected = ranked.slice(0, q.topK).map((r) => ({ record: map.get(r.id)!, score: r.score }));
    const candidates = ranked.map((r) => ({
      ...r,
      lexicalRank: rank(lexical, r.id),
      vectorRank: rank(vectors, r.id),
      sourceRefs: map.get(r.id)!.sourceRefs,
    }));
    const result: RetrievalResult = {
      strategy: q.strategy,
      indexVersion: "memory-index@1",
      namespace,
      candidates,
      selected,
      omitted: records
        .filter((r) => !selected.some((s) => s.record.id === r.id))
        .map((r) => ({
          id: r.id,
          reason: ranked.some((x) => x.id === r.id)
            ? "top-k"
            : q.strategy !== "baseline-v1" && !indexedIds.includes(r.id)
              ? "not-indexed"
              : "no-match",
        })),
      coverage: {
        status: q.strategy !== "baseline-v1" && indexedIds.length !== records.length ? "partial" : "complete",
        expected: records.length,
        recorded: q.strategy === "baseline-v1" ? records.length : indexedIds.length,
      },
      durationMs: performance.now() - started,
    };
    const event = await this.memory.captureSession.emit(
      scope,
      "memory.read",
      { query: q, ...result },
      {},
      { required: true, sourceRefs: records.flatMap((r) => r.sourceRefs) },
    );
    if (event) result.eventId = event.id;
    return result;
  }
}
function order(a: { id: string; score: number }, b: { id: string; score: number }) {
  return b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function rank(list: { id: string }[], id: string) {
  const n = list.findIndex((x) => x.id === id);
  return n < 0 ? null : n + 1;
}
