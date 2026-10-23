import { expect, it } from "vitest";
import * as facts from "../../src/engines/autonomous-specialists/requested-facts.js";

const unknown = { id: "service.statusCode", tool: "fixture.status.read", state: "unknown" };
it("keeps unknown as a state without exposing a placeholder as a value", () => {
  expect(facts.parseRequestedFacts([unknown])).toEqual([unknown]);
  expect(() => facts.parseRequestedFacts([{ ...unknown, value: "not yet observed" }])).toThrow(
    "REQUESTED_FACT_STATE_INVALID",
  );
});
it("allows a known literal value only as an explicitly known fact, without guessing sentinel words", () => {
  const known = { ...unknown, state: "known", value: "not yet observed" };
  expect(facts.parseRequestedFacts([known])).toEqual([known]);
  expect(() => facts.parseRequestedFacts([{ ...unknown, state: "known" }])).toThrow("REQUESTED_FACT_STATE_INVALID");
});
it("requires the matching completed read before unknown can become known and never completes a dropped fact", () => {
  const known = { ...unknown, state: "known", value: "violet-615" };
  expect(facts.reconcileRequestedFacts([unknown], [known], unknown.tool)).toEqual([known]);
  expect(facts.reconcileRequestedFacts([unknown], undefined, unknown.tool)).toEqual([unknown]);
  expect(() => facts.reconcileRequestedFacts([unknown], [known], "other.read")).toThrow("REQUESTED_FACT_RESULT_UNREAD");
  expect(() => facts.reconcileRequestedFacts([unknown], [{ ...known, tool: "other.read" }], unknown.tool)).toThrow(
    "REQUESTED_FACT_SCOPE_CHANGED",
  );
});
it("rejects duplicate facts and accepts a typed blocker without inventing a value", () => {
  expect(() => facts.parseRequestedFacts([unknown, unknown])).toThrow("REQUESTED_FACT_STATE_INVALID");
  expect(facts.parseRequestedFacts([{ ...unknown, state: "blocked", code: "READ_UNAVAILABLE" }])).toHaveLength(1);
  expect(() =>
    facts.parseRequestedFacts([{ ...unknown, state: "blocked", code: "READ_UNAVAILABLE", value: "unknown" }]),
  ).toThrow("REQUESTED_FACT_STATE_INVALID");
});

it("does not require a new read for an unchanged known fact with reordered keys", () => {
  const before = { ...unknown, state: "known", value: { code: "ready", count: 1 } };
  const after = { state: "known", tool: unknown.tool, id: unknown.id, value: { count: 1, code: "ready" } };
  expect(facts.reconcileRequestedFacts([before], [after])).toEqual([after]);
});
