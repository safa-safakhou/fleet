import { expect, test } from "vitest";
import { type CapacityCandidate, selectCapacityWork } from "../../src/research/orchestration/capacity.js";

const candidate = (
  taskId: string,
  bindingId = taskId,
  changes: Partial<CapacityCandidate> = {},
): CapacityCandidate => ({ taskId, bindingId, eligibleAt: 1000, lastDispatchAt: 0, event: false, ...changes });
const options = {
  now: 100000,
  clocks: { "pact.game-time-ms": 600000 },
  capacity: 4,
  activeBindings: new Set<string>(),
};
test("capacity grants distinct idle bindings and reserves fairness under urgent event bursts", () => {
  const old = candidate("old", "old", { lastDispatchAt: 1 }),
    urgent = Array.from({ length: 8 }, (_, i) =>
      candidate(`urgent-${i}`, `binding-${i}`, {
        lastDispatchAt: 90000,
        event: true,
        deadline: { clockId: "pact.game-time-ms", value: "620000" },
      }),
    );
  const result = selectCapacityWork([old, ...urgent], options);
  expect(result.selected).toHaveLength(4);
  expect(result.selected[0].taskId).toBe("old");
  expect(result.selected.slice(1).every((x) => x.event)).toBe(true);
  expect(new Set(result.selected.map((x) => x.bindingId)).size).toBe(4);
});
test("per-binding urgency selects one whole task, excludes active/future work and reports stale or unknown clocks", () => {
  const rows = [
    candidate("normal", "same", { eligibleAt: 99000 }),
    candidate("urgent", "same", {
      eligibleAt: 99000,
      event: true,
      deadline: { clockId: "pact.game-time-ms", value: "610000" },
    }),
    candidate("future", "future", { eligibleAt: 100001 }),
    candidate("busy", "busy"),
    candidate("expired", "expired", { deadline: { clockId: "pact.game-time-ms", value: "599999" } }),
    candidate("unknown", "unknown", { deadline: { clockId: "other", value: "100" } }),
  ];
  const result = selectCapacityWork(rows, { ...options, activeBindings: new Set(["busy"]) });
  expect(result.selected.map((x) => x.taskId)).toEqual(["urgent"]);
  expect(result.refused).toEqual([
    { taskId: "expired", reason: "expired" },
    { taskId: "unknown", reason: "unknown_deadline_clock" },
  ]);
});
test("fair actor rotation wins between ordinary events and scheduled work and never duplicates a delivery", () => {
  const result = selectCapacityWork(
    [
      candidate("event", "event", { lastDispatchAt: 90000, event: true }),
      candidate("scheduled", "scheduled", { lastDispatchAt: 1 }),
      candidate("scheduled", "scheduled", { lastDispatchAt: 1 }),
    ],
    { ...options, capacity: 1 },
  );
  expect(result.selected.map((x) => x.taskId)).toEqual(["scheduled"]);
  expect(result.refused).toEqual([]);
});
test("closed or occupied pools grant nothing and invalid capacities fail before dispatch", () => {
  expect(selectCapacityWork([candidate("a")], { ...options, capacity: 0 }).selected).toEqual([]);
  expect(
    selectCapacityWork([candidate("a")], { ...options, capacity: 1, activeBindings: new Set(["b"]) }).selected,
  ).toEqual([]);
  for (const capacity of [-1, 17, 1.5, Number.NaN])
    expect(() => selectCapacityWork([], { ...options, capacity })).toThrow("CAPACITY_LIMIT");
});

test("opt-in turn waves protect multi-call turns from replacement grants until every active binding drains", () => {
  const rows = [candidate("multi"), candidate("short"), candidate("replacement")];
  const wave = { ...options, capacity: 2, dispatchPolicy: "turn-wave" as const };
  expect(selectCapacityWork(rows, wave).selected).toHaveLength(2);
  // The short turn has finished, but the multi-call turn still needs provider capacity.
  expect(selectCapacityWork(rows, { ...wave, activeBindings: new Set(["multi"]) }).selected).toEqual([]);
  // Existing callers retain backfill behavior; changing it is an explicit experiment choice.
  expect(
    selectCapacityWork(rows, { ...options, capacity: 2, activeBindings: new Set(["multi"]) }).selected,
  ).toHaveLength(1);
  expect(selectCapacityWork(rows, wave).selected).toHaveLength(2);
});

test("turn-wave draining still reports expired work and rechecks deadlines before the next fair wave", () => {
  const rows = [
    candidate("expired", "expired", { deadline: { clockId: "pact.game-time-ms", value: "599999" } }),
    candidate("aged"),
    candidate("new", "new", { eligibleAt: 99999 }),
  ];
  const wave = { ...options, capacity: 1, dispatchPolicy: "turn-wave" as const };
  const draining = selectCapacityWork(rows, { ...wave, activeBindings: new Set(["other"]) });
  expect(draining.selected).toEqual([]);
  expect(draining.refused).toEqual([{ taskId: "expired", reason: "expired" }]);
  expect(selectCapacityWork(rows, wave).selected.map((x) => x.taskId)).toEqual(["aged"]);
  expect(() => selectCapacityWork([], { ...options, dispatchPolicy: "invalid" as never })).toThrow(
    "CAPACITY_DISPATCH_POLICY",
  );
});
