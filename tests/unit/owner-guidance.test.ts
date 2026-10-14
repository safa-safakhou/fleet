import { expect, it } from "vitest";
import { strategy } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { ownerRecallQuery, ownerValues } from "../../src/owner-guidance.js";

const historical = strategy("expansionist", "fixture");
it("follows real root owner intent through compact facts, instructions and recall rather than profile/history", () => {
  for (const ambition of ["Reliable winter supply", "Conserve silver"]) {
    const facts = { world: { audience: "owner", ambition, profile: { kingdomId: "self" } } };
    const objective = pactAdapter.accountObjective?.(facts);
    expect(pactAdapter.compactFacts(facts)).toMatchObject({ ambition, ownerIntentStatus: "provided" });
    expect(ownerValues("account_autonomy", historical, objective)).toMatchObject({ accountObjective: ambition });
    expect(ownerRecallQuery("account_autonomy", historical, objective)).toBe(ambition);
  }
});
it("never recovers an absent root objective from a wrong-profile fixture or generated strategy", () => {
  const facts = { world: { profile: { kingdomId: "self", ambition: "Wrong field" } } };
  expect(pactAdapter.accountObjective?.(facts)).toBeUndefined();
  expect(pactAdapter.compactFacts(facts)).toMatchObject({ ambition: null, ownerIntentStatus: "absent" });
  expect(ownerValues("account_autonomy", historical, undefined)).toMatchObject({
    accountObjective: null,
    objectiveStatus: "absent",
  });
  expect(ownerRecallQuery("account_autonomy", historical, undefined)).not.toBe(historical.objective);
  expect(ownerValues("strategy", historical, "Current owner")).toEqual(historical);
});
