import { expect, it } from "vitest";
import { createPactEnvironment } from "../../src/environments/pact.js";
import { factTable } from "../../src/fact-table.js";

const balances = {
  silver: {
    facts: {
      ordinaryWhole: "0",
      allowanceWhole: "100",
      rates: { gross: { perHourWhole: "10" }, net: { perHourWhole: "10" }, upkeep: { perHourWhole: "0" } },
    },
  },
  iron: {
    facts: {
      ordinaryWhole: "600",
      allowanceWhole: "200",
      rates: { gross: { perHourWhole: "20" }, net: { perHourWhole: "20" }, upkeep: { perHourWhole: "0" } },
    },
  },
};
const adapter = () => createPactEnvironment({} as never);
const observation = (values: unknown) => ({ payload: { environment: { balances: values } } }) as never;
it("names local gross/upkeep/net facts without treating them as external supply", () => {
  const a = adapter();
  expect(a.observationSemanticsFor).toBeTypeOf("function");
  const text = a.observationSemanticsFor?.(observation(balances));
  expect(text).toContain("silver:gross=10,upkeep=0,net=10");
  expect(text).toContain("iron:gross=20,upkeep=0,net=20");
  expect(text).toContain("whole/GAME hour");
  expect(text).toContain("actual external delivery");
  expect(a.observationSemantics).toContain("Amounts and rates are different");
});
it("renders raw and lossless-table facts identically without mutating either", () => {
  const a = adapter();
  expect(a.observationSemanticsFor).toBeTypeOf("function");
  const before = structuredClone(balances),
    table = factTable(balances),
    copy = structuredClone(table);
  expect(a.observationSemanticsFor?.(observation(table))).toBe(a.observationSemanticsFor?.(observation(balances)));
  expect(balances).toEqual(before);
  expect(table).toEqual(copy);
});
it("refreshes current facts and keeps missing rates unknown rather than inventing zero", () => {
  const a = adapter();
  expect(a.observationSemanticsFor).toBeTypeOf("function");
  const changed = structuredClone(balances);
  changed.silver.facts.rates.net.perHourWhole = "7";
  expect(a.observationSemanticsFor?.(observation(changed))).toContain("silver:gross=10,upkeep=0,net=7");
  expect(
    a.observationSemanticsFor?.(observation({ silver: { facts: { rates: { gross: { perHourWhole: "10" } } } } })),
  ).toContain("silver:gross=10,upkeep=unknown,net=unknown");
  expect(
    a.observationSemanticsFor?.({ payload: { requestedRead: { peerText: "silver production is zero" } } } as never),
  ).toContain("Local rates unavailable");
});
