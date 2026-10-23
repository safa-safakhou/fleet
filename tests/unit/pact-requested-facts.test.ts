import { expect, it } from "vitest";
import * as facts from "../../src/games/pact/requested-facts.js";

const request = {
  entityRef: "self",
  id: "thread.records",
  tool: "pact_council_thread_v1",
  args: { kingdomId: "peer" },
  path: ["records"],
};
const catalog = [{ name: request.tool, annotations: { readOnlyHint: true }, inputSchema: {} }];
it("validates explicit operator requests, rejecting duplicates and unsafe paths", () => {
  expect(facts.parsePactFactRequests(JSON.stringify([request]))).toEqual([request]);
  for (const value of [[request, request], [{ ...request, path: ["__proto__"] }], [{ ...request, value: "pretend" }]])
    expect(() => facts.parsePactFactRequests(JSON.stringify(value))).toThrow("PACT_FACT_REQUESTS_INVALID");
});
it("requires the exact scoped result, retaining unknown without a placeholder value", () => {
  const tracker = facts.createPactFactTracker([request], "self");
  expect(tracker.update({}, undefined, catalog)).toEqual([
    { id: request.id, tool: request.tool, args: request.args, state: "unknown" },
  ]);
  expect(tracker.update({ readSchema: request.tool }, { records: [] }, catalog)[0].state).toBe("unknown");
  expect(tracker.update({ tool: request.tool, args: { kingdomId: "other" } }, { records: [] }, catalog)[0].state).toBe(
    "unknown",
  );
  expect(tracker.update({ tool: request.tool, args: request.args }, {}, catalog)[0].state).toBe("unknown");
  expect(tracker.update({ tool: request.tool, args: request.args }, { records: [] }, catalog)).toEqual([
    { id: request.id, tool: request.tool, args: request.args, state: "known", value: [] },
  ]);
});
it("scopes requests to the authenticated entity and grants no absent or write tool", () => {
  expect(facts.createPactFactTracker([request], "other").update({}, undefined, catalog)).toEqual([]);
  for (const tools of [[], [{ ...catalog[0], annotations: { readOnlyHint: false } }]])
    expect(facts.createPactFactTracker([request], "self").update({}, undefined, tools)).toEqual([
      { id: request.id, tool: request.tool, args: request.args, state: "blocked", code: "READ_TOOL_UNAVAILABLE" },
    ]);
});
