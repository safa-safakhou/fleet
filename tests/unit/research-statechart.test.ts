import { expect, test, vi } from "vitest";
import { StatechartPolicy } from "../../src/research/workers/statechart.js";
import { policyInput as input } from "../fixtures/research/pact-policy.js";

test("restoration_is_pure and preserves proposal identity", () => {
  const network = vi.spyOn(globalThis, "fetch"),
    p = new StatechartPolicy();
  const first = p.step(input),
    second = p.step(input, JSON.parse(JSON.stringify(first.checkpoint)));
  expect(second).toEqual(first);
  expect(p.step(input, second.checkpoint)).toEqual(first);
  expect(first.proposal.kind).toBe("action");
  expect(first.trace).toMatchObject({ from: "ready", to: "selected", eventRef: input.eventRef });
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
});
test("refuses stale facts, changed checkpoint version and mismatched clocks", () => {
  const p = new StatechartPolicy(),
    cp = p.step(input).checkpoint;
  expect(() => p.step({ ...input, nowUtc: "2026-10-31T10:01:00.000Z" }, cp)).toThrow("OBSERVATION_STALE");
  expect(() => p.step(input, { ...cp, policyVersion: "foreign@1" })).toThrow("CHECKPOINT_INCOMPATIBLE");
  expect(() => p.step({ ...input, clock: { ...input.clock, clockId: "utc" } })).toThrow("CLOCK_INCOMPATIBLE");
  expect(() => p.step({ ...input, eventRef: "different" }, cp)).toThrow("POLICY_CHECKPOINT_TERMINAL");
  expect(p.step({ ...input, clock: { ...input.clock, paused: true } }).proposal.kind).toBe("wait");
  expect(p.step({ ...input, authority: "advisory" }).proposal.kind).toBe("advisory");
});
