import { expect, test } from "vitest";
import { EventInputSchema } from "../../src/research/evidence/types.js";

test("metadata rejects private payloads and invalid clocks", () => {
  const base = {
    producerKey: "event",
    streamId: "model",
    kind: "model.request",
    occurredAt: "2026-10-30T12:00:00.000Z",
    parentIds: [],
    attributes: {},
    artifacts: [],
    coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
  };
  expect(EventInputSchema.parse(base).kind).toBe("model.request");
  expect(() => EventInputSchema.parse({ ...base, attributes: { prompt: "PRIVATE" } })).toThrow();
  expect(() => EventInputSchema.parse({ ...base, kind: "PRIVATE" })).toThrow();
  expect(() => EventInputSchema.parse({ ...base, durationNs: "-1" })).toThrow();
});
