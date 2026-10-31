import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StepJournal } from "../../../src/research/broker/steps.js";
import { CaptureSession } from "../../../src/research/evidence/boundaries.js";
import { ArtifactFilesystem } from "../../../src/research/evidence/filesystem.js";
import { compileManifest } from "../../../src/research/manifests/compiler.js";
import { ManifestRepository } from "../../../src/research/manifests/repository.js";
import { MemoryRepository } from "../../../src/research/memory/repository.js";
import type { SourceClass } from "../../../src/research/memory/schema.js";
import { assertOwnedFixture } from "../../architecture-fixture.js";
import { platformFixture } from "../../platform-helpers.js";
import { capability, manifestInput } from "./manifest.js";
export async function memoryFixture(
  index = true,
  options: {
    strategy?: "baseline-v1" | "fts-v1" | "vector-exact-v1" | "rrf-v1";
    embedding?: import("../../../src/research/manifests/compiler.js").RunManifestInput["memory"]["embedding"];
    language?: string;
    contextPolicy?: string;
    evaluation?: { datasetDigest: string; split: string; maxCalls: number };
  } = {},
) {
  await assertOwnedFixture(process.env.FLEET_TEST_DATABASE_URL ?? "", process.env.FLEET_ARCHITECTURE_NONCE ?? "");
  const f = await platformFixture(),
    root = await mkdtemp(join(tmpdir(), "fleet-memory-"));
  await f.pool.query("UPDATE cohorts SET model=model||$2::jsonb WHERE id=$1", [
    f.group.id,
    JSON.stringify({ temperature: 1, topP: 1 }),
  ]);
  await f.store.consent(f.group.id, true);
  await f.enqueue();
  const claim = await f.claim();
  const input = manifestInput();
  input.profile = claim.profile;
  input.model = { route: "ollama", model: "fake-model", parameters: { maxOutputTokens: 100 } };
  input.context.policy = options.contextPolicy ?? input.context.policy;
  if (options.contextPolicy) input.limits = { calls: "3", tokens: "1000000", concurrency: 1 };
  if (options.evaluation) {
    input.roles = [{ id: "evaluator", authority: "advisory" }];
    input.tools = [];
    input.context.maxBytes = 16384;
    input.limits = { calls: String(options.evaluation.maxCalls), tokens: "1000000", concurrency: 1 };
    input.evaluation = {
      evaluator: "pact-rules@1",
      dataset: options.evaluation.datasetDigest,
      split: options.evaluation.split,
    };
  }
  input.environment.bindingId = claim.bindingId;
  input.retrieval.strategy = options.strategy ?? "baseline-v1";
  input.retrieval.language = options.language ?? "en";
  if (options.embedding) input.memory.embedding = options.embedding;
  if (index) {
    input.memory.indexPolicy = "consented";
    input.memory.indexConsentRef = "fixture-index";
  }
  const m = compileManifest(input, {
    ...capability,
    model: { ...capability.model, route: "ollama", model: "fake-model" },
    indexGrants: index
      ? [
          {
            ref: "fixture-index",
            bindingId: claim.bindingId,
            namespace: input.memory.namespace,
            ...(options.embedding
              ? { embeddingRevision: options.embedding.revision, dimension: options.embedding.dimension }
              : {}),
          },
        ]
      : [],
  });
  await new ManifestRepository(f.pool).save(m.manifest);
  const journal = new StepJournal(f.store, f.tasks),
    scope = await journal.open(claim, "memory-run", "memory-op", m.digest),
    capture = new CaptureSession(f.store, new ArtifactFilesystem(root));
  await capture.recorder.append(scope, { kind: "task.received", streamId: "memory", producerKey: "fixture" });
  const memory = new MemoryRepository(f.store, journal, capture);
  async function source(sourceClass: SourceClass, text = "Synthetic source") {
    const event = await capture.emit(scope, "observation.record", { text }, {}, { required: true });
    const ref = (
      await f.pool.query("SELECT event->'artifacts'->0 artifact FROM research_events WHERE id=$1", [event!.id])
    ).rows[0].artifact;
    await memory.registerSource(scope, { artifactId: ref.id, sourceClass, observedAt: f.now().toISOString() });
    return ref.id as string;
  }
  return {
    ...f,
    claimTask: f.claim,
    claim,
    scope,
    capture,
    memory,
    manifest: m.manifest,
    source,
    close: async () => {
      await f.pool.end();
      await rm(root, { recursive: true, force: true });
    },
  };
}
