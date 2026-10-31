import { expect, test } from "vitest";
import { outcomeRows } from "../../web/research/outcomes.js";
import { resourceSeries } from "../../web/research/resources.js";
import type { EvidenceEvent, MetricSet } from "../../web/research/types.js";

test("activity_is_not_effectiveness and null cost is never zero", () => {
  const set = {
    values: [
      { id: "calls.v1", value: 205, unit: "call" },
      { id: "known_input_tokens.v1", value: 1000, unit: "token" },
      { id: "known_tokens_per_success.v1", value: null, unit: "token/success" },
    ],
    unresolvedUsage: { allocations: 2, reservedTokens: "5000" },
  } as MetricSet;
  expect(resourceSeries(set).find((x) => x.id === "calls.v1")!.value).toBe(205);
  expect(resourceSeries(set).find((x) => x.id === "known_tokens_per_success.v1")!.value).toBeNull();
  const rows = outcomeRows([
    {
      id: "receipt",
      kind: "command.receipt",
      attributes: { outcome: "ok" },
      parentIds: [],
      occurredAt: "2026-10-31T10:00:00.000Z",
    },
    {
      id: "wait",
      kind: "task.state",
      attributes: { code: "WAIT" },
      parentIds: [],
      occurredAt: "2026-10-31T10:01:00.000Z",
    },
  ] as unknown as EvidenceEvent[]);
  expect(rows[0].meaning).toBe("Admission receipt; completion not established");
  expect(rows[1].meaning).toContain("WAIT");
  expect(rows.some((x) => x.meaning === "completed")).toBe(false);
});
