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
