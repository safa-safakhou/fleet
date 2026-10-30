import { expect, test } from "vitest";
import {
  compileManifest,
  type RunManifestInput,
  validateCompatibility,
} from "../../src/research/manifests/compiler.js";
import { capability, manifestInput } from "../fixtures/research/manifest.js";

test("seals resolved defaults and canonical key ordering", () => {
  const input = manifestInput();
  const compiled = compileManifest(input, capability);
  expect(compiled.manifest.status).toBe("experimental");
  expect(compiled.manifest.model.parameters.temperature).toBe(1);
  expect(
    compileManifest(Object.fromEntries(Object.entries(input).reverse()) as RunManifestInput, capability),
  ).toBeDefined();
});
test("changing inference configuration changes digest while key order does not", () => {
  const input = manifestInput(),
    a = compileManifest(input, capability);
  expect(compileManifest({ ...input, profile: { version: "1", id: "fixture" } }, capability).digest).toBe(a.digest);
  input.model.parameters.temperature = 0.5;
  expect(compileManifest(input, capability).digest).not.toBe(a.digest);
});
test.each([
  ["clock", "CLOCK_INCOMPATIBLE"],
  ["freshness", "OBSERVATION_STALE"],
  ["schema", "MODEL_SCHEMA_UNSUPPORTED"],
  ["embedding", "EMBEDDING_INCOMPATIBLE"],
  ["budget", "PROTECTION_REQUIRED"],
  ["index", "INDEX_PERMISSION_REQUIRED"],
  ["checkpoint", "CHECKPOINT_INCOMPATIBLE"],
  ["capability", "CAPABILITY_CHANGED"],
])("rejects_semantic_mismatch %s", (kind, code) => {
  const input = manifestInput(),
    cap = structuredClone(capability);
  if (kind === "clock") input.clock.deadlineId = "utc";
  if (kind === "freshness") input.context.maxObservationAgeMs = 10000;
  if (kind === "schema") cap.model.jsonSchema = false;
  if (kind === "embedding")
    input.memory.embedding = { revision: "fake", digest: "d".repeat(64), dimension: 0, normalization: "l2" };
  if (kind === "budget") (input.protections as Record<string, boolean>).budget = false;
  if (kind === "index") input.retrieval.strategy = "fts-v1";
  if (kind === "checkpoint") input.checkpoint.version = "2";
  if (kind === "capability") input.expectedCapabilityDigest = "0".repeat(64);
  expect(validateCompatibility(input, cap).map((x) => x.code)).toContain(code);
  expect(() => compileManifest(input, cap)).toThrow(code);
});
test("refuses unknown configuration keys and credential payloads", () =>
  expect(() => compileManifest({ ...manifestInput(), apiKey: "synthetic-secret" } as never, capability)).toThrow(
    "INVALID_MANIFEST",
  ));
test("UTC deadlines are canonical valid instants rather than normalized invalid dates", () => {
  const input = manifestInput(),
    cap = structuredClone(capability);
  input.clock = { observationId: "utc", deadlineId: "utc", deadlineValue: "2026-02-31T12:00:00.000Z" };
  cap.environment.clockId = "utc";
  expect(() => compileManifest(input, cap)).toThrow("CLOCK_INCOMPATIBLE");
  input.clock.deadlineValue = "2026-02-28T12:00:00.000Z";
  expect(compileManifest(input, cap).manifest.clock.deadlineValue).toBe("2026-02-28T12:00:00.000Z");
});
test("configuration cannot load an unreviewed executable component", () => {
  const input = manifestInput();
  input.components.worker = "../../model.js";
  expect(() => compileManifest(input, capability)).toThrow("COMPONENT_UNSUPPORTED");
});
test.each(["toString", "constructor", "__proto__"])(
  "inherited component name %s is not a reviewed capability",
  (name) => {
    const input = manifestInput();
    input.components = Object.fromEntries([[name, "fixture@1"]]);
    expect(() => compileManifest(input, capability)).toThrow("COMPONENT_UNSUPPORTED");
  },
);
