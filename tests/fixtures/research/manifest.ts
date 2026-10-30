import type { CapabilityFingerprint, RunManifestInput } from "../../../src/research/manifests/compiler.js";
export const capability: CapabilityFingerprint = {
  components: { worker: ["fixture@1"] },
  environment: {
    apiVersion: "1",
    observationVersion: "1",
    effectsVersion: "1",
    worldIncarnation: "fixture-world",
    clockId: "pact.tick",
  },
  model: { route: "fixture", model: "fake", jsonSchema: true, tools: true, contextWindow: 8192 },
  checkpointVersion: "1",
  maxObservationAgeMs: 5000,
  allowedTools: ["look"],
  indexGrants: [],
};
export function manifestInput(): RunManifestInput {
  return {
    schemaVersion: "fleet.run/v1",
    profile: { id: "fixture", version: "1" },
    build: { source: "a".repeat(64), build: "b".repeat(64), dependencies: "c".repeat(64) },
    environment: {
      kind: "pact",
      bindingId: "binding",
      worldIncarnation: "fixture-world",
      apiVersion: "1",
      observationVersion: "1",
      effectsVersion: "1",
    },
    components: { worker: "fixture@1" },
    roles: [{ id: "actor", authority: "actor" }],
    model: { route: "fixture", model: "fake", parameters: { maxOutputTokens: 100 } },
    context: { policy: "plain-v1", maxBytes: 8192, maxTokens: 4096, maxObservationAgeMs: 5000, compression: false },
    retrieval: { strategy: "baseline-v1", language: "en", topK: 5 },
    memory: { namespace: "owned", indexPolicy: "disabled" },
    tools: ["look"],
    clock: { observationId: "pact.tick", deadlineId: "pact.tick", deadlineValue: "100" },
    limits: { calls: "10", tokens: "10000", concurrency: 1 },
    evidence: { required: true, retentionDays: 30, maxArtifactBytes: "10485760" },
    protections: {
      identity: true,
      permission: true,
      lease: true,
      privacy: true,
      budget: true,
      fencing: true,
      journal: true,
    },
    checkpoint: { version: "1" },
    evaluation: { evaluator: "fixture@1", dataset: "synthetic@1", split: "development" },
    seed: "42",
  };
}
