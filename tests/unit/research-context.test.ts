import { expect, test } from "vitest";
import { ContextAssembler, type ContextSource } from "../../src/research/context/assembler.js";

const now = "2026-10-31T10:00:00.000Z",
  scope = {
    runId: "run",
    agentId: "actor",
    bindingId: "binding",
    taskId: "task",
    turnId: "turn",
    operationId: "op",
    operationEpoch: "1",
    manifestDigest: "a".repeat(64),
  };
const sources: ContextSource[] = [
  {
    id: "owner",
    slot: "owner",
    sourceClass: "owner-guidance",
    text: "Build only within the owner's mandate.",
    sourceRefs: ["native:mandate"],
    observedAt: now,
    expiresAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "facts",
    slot: "observation",
    sourceClass: "observation",
    text: "木".repeat(200),
    sourceRefs: ["native:facts"],
    observedAt: now,
    expiresAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "feedback",
    slot: "feedback",
    sourceClass: "feedback",
    text: "The native stock check rejected the prior proposal.",
    sourceRefs: ["native:rejection"],
    observedAt: now,
    expiresAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "pending",
    slot: "pending-command",
    sourceClass: "command-admitted",
    text: '{"commandId":"original:exact-id","status":"pending"}',
    sourceRefs: ["native:pending"],
    observedAt: now,
    expiresAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "belief",
    slot: "memory",
    sourceClass: "inference",
    text: "irrelevant tentative belief ".repeat(1000),
    sourceRefs: ["memory:belief"],
    observedAt: now,
    expiresAt: "2026-11-01T00:00:00.000Z",
  },
];
const input = {
  refs: sources.map((s) => ({ id: s.id, mandatory: s.id !== "belief" })),
  schema: { type: "object" },
  maxBytes: 4000,
  maxTokens: 1500,
  maxOutputTokens: 100,
  maxObservationAgeMs: 5000,
  now,
};
const assembler = new ContextAssembler({ resolve: async (_scope, id) => sources.find((s) => s.id === id) });
test("mandatory_sources_cannot_disappear and UTF8 spans map exact final messages", async () => {
  const packet = await assembler.build(scope, input),
    again = await assembler.build(scope, { ...input, refs: [...input.refs].reverse() });
  expect(packet.digest).toBe(again.digest);
  expect(packet.lineage.omitted).toEqual([{ id: "belief", reason: "capacity" }]);
  expect(packet.lineage.mandatoryCoverage).toEqual({ expected: 4, recorded: 4, status: "complete" });
  for (const span of packet.lineage.spans) {
    const source = sources.find((s) => s.id === span.id)!;
    expect(
      Buffer.from(packet.messages[span.messageIndex].content).subarray(span.startByte, span.endByte).toString(),
    ).toBe(source.text);
  }
  expect(JSON.stringify(packet.messages)).toContain("original:exact-id");
  expect(packet.accounting.schemaBytes).toBe(17);
});
test("impossible capacity and expired mandatory facts refuse before inference", async () => {
  await expect(assembler.build(scope, { ...input, maxBytes: 10 })).rejects.toThrow("CONTEXT_CAPACITY_REQUIRED");
  await expect(assembler.build(scope, { ...input, now: "2026-11-02T00:00:00.000Z" })).rejects.toThrow(
    "CONTEXT_SOURCE_UNAVAILABLE",
  );
  await expect(assembler.build(scope, { ...input, maxTokens: 100 })).rejects.toThrow("CONTEXT_CAPACITY_REQUIRED");
});
