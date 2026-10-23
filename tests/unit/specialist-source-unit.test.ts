import { expect, it } from "vitest";
import { negotiationGoalText } from "../../../pact/tests/evaluation/negotiation-goal.js";
import { expandFactTables, factTable } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";

const balances = {
  iron: {
    ordinaryUnits: "360000",
    capacityUnits: "360000",
    facts: {
      ordinaryWhole: "600",
      allowanceWhole: "200",
      rates: { gross: { perHourWhole: "20" }, net: { perHourWhole: "20" }, upkeep: { perHourWhole: "0" } },
    },
  },
  silver: {
    ordinaryUnits: "0",
    capacityUnits: "360000",
    facts: {
      ordinaryWhole: "0",
      allowanceWhole: "100",
      rates: { gross: { perHourWhole: "10" }, net: { perHourWhole: "10" }, upkeep: { perHourWhole: "0" } },
    },
  },
  grain: {
    ordinaryUnits: "0",
    capacityUnits: "360000",
    facts: {
      ordinaryWhole: "0",
      allowanceWhole: "80",
      rates: { gross: { perHourWhole: "30" }, net: { perHourWhole: "22" }, upkeep: { perHourWhole: "8" } },
    },
  },
};
it("keeps whole facts named rather than flattening them among marked columns", () => {
  const before = structuredClone(balances),
    legacy = factTable(balances),
    named = factTable(balances, { atomicPaths: ["facts"] });
  expect(expandFactTables(named)).toEqual(balances);
  expect(balances).toEqual(before);
  expect(factTable(balances)).toEqual(legacy);
  if ((named as { factTable?: string }).factTable) {
    expect((named as { columns: string[] }).columns).toContain("facts");
    expect((named as { columns: string[] }).columns.some((c) => c.startsWith("facts."))).toBe(false);
  } else expect(named).toEqual(balances);
  expect(JSON.stringify(named)).toContain('"perHourWhole":"20"');
});
it("binds the original external receipt requirement without changing numeric goals or legacy text", () => {
  const goal = { receive: "silver", minimumReceivePerHour: 1, maximumSendPerHour: 4 };
  const legacy = negotiationGoalText(goal, true),
    next = JSON.parse(negotiationGoalText(goal, "external.v1"));
  expect(negotiationGoalText(goal, false)).toBe(JSON.stringify(goal));
  expect(JSON.parse(legacy).scope).toBe("supply delivery rates; not communication allowance");
  for (const [key, value] of Object.entries(goal)) expect(next[key]).toBe(value);
  expect(next.scope).toContain("external peer");
  expect(next.scope).toContain("excludes local production");
  expect(next.scope).toContain("not communication allowance");
});
it("projects registered PACT specialist views and retains legacy projection", () => {
  const obs = { schemaId: "pact.observation.v1", payload: { world: { balances } } } as never;
  expect(projectPactObservation(obs, { id: "specialists", version: "2" }).schemaId).toBe(
    "pact.observation.specialists.v2",
  );
  expect(projectPactObservation(obs, { id: "specialists", version: "1" }).schemaId).toBe(
    "pact.observation.specialists.v1",
  );
  expect(projectPactObservation(obs, { id: "specialists", version: "3" }).schemaId).toBe(
    "pact.observation.specialists.v3",
  );
  expect(() => projectPactObservation(obs, { id: "specialists", version: "5" })).toThrow();
});
