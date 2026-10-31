import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { digest } from "../src/research/contracts.js";
import { EmbeddingPort } from "../src/research/memory/embedding-client.js";
import { relevanceMetrics } from "../src/research/memory/evaluation.js";
import { RetrievalService } from "../src/research/memory/retrieval.js";
import { childFixtureEnvironment, createOwnedFixture } from "./test-architecture-offline.js";

const Vector = z.array(z.number().finite()).min(1).max(4096);
const Dataset = z
  .object({
    schemaVersion: z.literal("fleet.retrieval-dataset/v1"),
    id: z.string(),
    split: z.literal("development"),
    topK: z.number().int().min(1).max(3),
    documents: z
      .array(z.object({ id: z.string(), text: z.string(), vector: Vector }).strict())
      .min(1)
      .max(4),
    queries: z
      .array(
        z
          .object({
            id: z.string(),
            text: z.string(),
            vector: Vector,
            relevance: z.record(z.string(), z.number().min(0).max(4)),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
const EvaluationConfig = z
  .object({
    schemaVersion: z.literal("fleet.synthetic-retrieval-config/v1"),
    strategy: z.enum(["fts-v1", "vector-exact-v1", "rrf-v1"]),
    language: z.enum(["en", "simple"]),
    embedding: z
      .object({
        revision: z.string(),
        digest: z.string().regex(/^[a-f0-9]{64}$/),
        dimension: z.number().int().min(1).max(4096),
        normalization: z.enum(["l2", "none"]),
      })
      .strict(),
  })
  .strict();
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== "--dataset" || args[2] !== "--manifest")
  throw Error("EXPLICIT_SYNTHETIC_INPUTS_REQUIRED");
const dataset = Dataset.parse(JSON.parse(await readFile(resolve(args[1]), "utf8"))),
  reference = JSON.parse(await readFile(resolve(args[3]), "utf8"));
const config = EvaluationConfig.parse(reference.retrievalEvaluation);
if (
  new Set(dataset.documents.map((d) => d.id)).size !== dataset.documents.length ||
  new Set(dataset.queries.map((q) => q.id)).size !== dataset.queries.length ||
  dataset.queries.some((q) => Object.keys(q.relevance).some((id) => !dataset.documents.some((d) => d.id === id)))
)
  throw Error("RETRIEVAL_LABELS_INVALID");
// This entry point always owns a new fixture. Caller database routes are never used.
process.env.FLEET_RESEARCH_VECTOR_FIXTURE = "1";
const fixture = await createOwnedFixture();
try {
  Object.assign(process.env, childFixtureEnvironment(fixture, process.env));
  const { memoryFixture } = await import("../tests/fixtures/research/memory.js");
  const f = await memoryFixture(true, {
    strategy: config.strategy,
    embedding: config.embedding,
    language: config.language,
  });
  try {
    await f.memory.indexPolicy.grant(f.scope, "fixture-index");
    const port = new EmbeddingPort(f.memory, {
      identity: config.embedding,
      async embed(texts, mode) {
        return {
          identity: config.embedding,
          vectors: texts.map((text) => {
            const item = (mode === "document" ? dataset.documents : dataset.queries).find((item) => item.text === text);
            if (!item) throw Error("FAKE_VECTOR_MISSING");
            return item.vector;
          }),
          usage: { purpose: "embedding", cpuMs: 0, durationMs: 0, items: texts.length },
        };
      },
    });
    const documentIds = new Map<string, string>();
    for (const document of dataset.documents) {
      const source = await f.source("observation", document.text);
      const ref = await f.memory.capture(f.scope, {
        kind: "episode",
        sourceClass: "observation",
        text: document.text,
        sourceRefs: [source],
        observedAt: f.now().toISOString(),
        privacy: "private",
        indexPolicyId: "fixture-index",
      });
      documentIds.set(ref.id, document.id);
      await port.embed(f.scope, {
        key: `document:${document.id}`,
        mode: "document",
        memoryId: ref.id,
        version: ref.version,
      });
    }
    const results: Array<{
      queryId: string;
      selected: string[];
      precisionAtK: number;
      recallAtK: number;
      mrr: number;
      ndcgAtK: number;
      durationMs: number;
      coverage: { status: "complete" | "partial"; expected: number; recorded: number };
    }> = [];
    for (const query of dataset.queries) {
      const vector = (await port.embed(f.scope, { key: `query:${query.id}`, mode: "query", text: query.text }))
        .vectors[0];
      const result = await new RetrievalService(f.memory).search(f.scope, {
        strategy: config.strategy,
        text: query.text,
        language: config.language,
        topK: dataset.topK,
        vector,
      });
      const selected = result.selected.map((r) => documentIds.get(r.record.id)!);
      results.push({
        queryId: query.id,
        selected,
        ...relevanceMetrics(selected, query.relevance, dataset.topK),
        durationMs: result.durationMs,
        coverage: result.coverage,
      });
    }
    const mean = (key: "precisionAtK" | "recallAtK" | "mrr" | "ndcgAtK" | "durationMs") =>
      results.reduce((sum, r) => sum + r[key], 0) / results.length;
    console.log(
      JSON.stringify(
        {
          schemaVersion: "fleet.retrieval-evaluation/v1",
          datasetId: dataset.id,
          datasetDigest: digest(dataset),
          manifestDigest: digest(reference),
          split: dataset.split,
          strategy: config.strategy,
          indexVersion: "memory-index@1",
          embedding: config.embedding,
          compute: "fake-vectors",
          postgresVersion: (await f.pool.query("SHOW server_version")).rows[0].server_version,
          vectorVersion: (await f.pool.query("SELECT extversion FROM pg_extension WHERE extname='vector'")).rows[0]
            .extversion,
          metrics: {
            precisionAtK: mean("precisionAtK"),
            recallAtK: mean("recallAtK"),
            mrr: mean("mrr"),
            ndcgAtK: mean("ndcgAtK"),
            meanDurationMs: mean("durationMs"),
          },
          coverage: results.every((r) => r.coverage.status === "complete") ? "complete" : "partial",
          results,
          realArtifact: { status: "skipped", reason: "No separately authorized pinned weights provisioned" },
          qualification: "synthetic development corpus only; no multilingual or model-quality qualification",
        },
        null,
        2,
      ),
    );
  } finally {
    await f.close();
  }
} finally {
  await fixture.close();
}
