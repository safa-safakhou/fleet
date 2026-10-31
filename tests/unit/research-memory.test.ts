import { expect, test } from "vitest";
import { MemoryInputSchema, namespaceFor } from "../../src/research/memory/schema.js";
import { manifestInput } from "../fixtures/research/manifest.js";

const base = {
  kind: "belief",
  sourceClass: "inference",
  text: "A tentative interpretation",
  sourceRefs: ["source:1"],
  observedAt: "2026-10-31T10:00:00.000Z",
  privacy: "private",
};
test("belief and receipt classes cannot be promoted by projection", () => {
  expect(MemoryInputSchema.safeParse(base).success).toBe(true);
  expect(MemoryInputSchema.safeParse({ ...base, sourceClass: "confirmed-outcome" }).success).toBe(false);
});
test("namespace binds world actor participant and embedding identity", () => {
  const m = manifestInput(),
    scope = { agentId: "a", bindingId: "b", participantId: "p" };
  const key = namespaceFor(scope, m);
  expect(namespaceFor({ ...scope, agentId: "other" }, m)).not.toBe(key);
  expect(namespaceFor(scope, { ...m, environment: { ...m.environment, worldIncarnation: "other" } })).not.toBe(key);
  expect(
    namespaceFor(scope, {
      ...m,
      memory: { ...m.memory, embedding: { revision: "r1", digest: "a".repeat(64), dimension: 3, normalization: "l2" } },
    }),
  ).not.toBe(key);
});
