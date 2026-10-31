import { expect, test } from "vitest";
import { researchRoute } from "../../web/research/route.js";
import { buildTrace } from "../../web/research/timeline.js";
import type { EvidenceEvent } from "../../web/research/types.js";

const e = (
  id: string,
  streamId: string,
  sequence: string,
  occurredAt: string,
  parentIds: string[] = [],
  extra: Partial<EvidenceEvent> = {},
): EvidenceEvent => ({
  id,
  streamId,
  sequence,
  occurredAt,
  parentIds,
  ordinal: sequence,
  kind: "model.request",
  recordedAt: "2026-10-31T10:00:05.000Z",
  attributes: {},
  artifacts: [],
  coverage: { status: "complete", expected: "1", recorded: "1", reasons: [] },
  schemaVersion: "fleet.evidence/v1",
  scope: {} as EvidenceEvent["scope"],
  ...extra,
});
test("parallel_lanes_preserve_sequence despite skew, late arrivals, fan-in and missing parents", () => {
  const trace = buildTrace([
    e("b", "worker", "2", "2026-10-31T09:00:00.000Z", ["a", "missing"]),
    e("c", "other", "1", "2026-10-31T10:00:00.000Z", ["a"]),
    e("a", "worker", "1", "2026-10-31T10:00:00.000Z", [], { durationNs: "2000000", processId: "process-a" }),
    e("d", "worker", "4", "2026-10-31T10:00:00.000Z", ["b"], { kind: "queue.enter" }),
  ]);
  expect(trace.lanes.find((x) => x.id === "worker")!.events.map((x) => x.id)).toEqual(["a", "b", "d"]);
  expect(trace.edges).toContainEqual({ source: "missing", target: "b", unavailable: true });
  expect(trace.nodes.find((x) => x.id === "b")!.durationMs).toBeNull();
  expect(trace.gaps.some((x) => x.includes("worker") && x.includes("3"))).toBe(true);
  expect(trace.nodes.find((x) => x.id === "a")!.durationMs).toBe(2);
  expect(trace.nodes.find((x) => x.id === "d")!.label).toContain("censored");
  expect(buildTrace([e("a", "a", "1", "2026-10-31T10:00:00.000Z")]).nodes[0].label).toContain("gap");
});
test("deep links retain opaque run/event identifiers and refuse malformed routes", () => {
  expect(researchRoute("#research/run/run%3A1?event=event%3A2")).toEqual({
    kind: "run",
    runId: "run:1",
    eventId: "event:2",
  });
  expect(researchRoute("#run=legacy")).toBeNull();
  expect(researchRoute("#research/run/%zz")).toBeNull();
});
