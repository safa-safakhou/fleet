import { expect, it } from "vitest";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { type FixtureProviders, runNegotiationFixture } from "../fixtures/negotiation/driver.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { scriptedProviders } from "../fixtures/negotiation/providers.js";
import { fixtureWaitBasis } from "../fixtures/pact-progress-basis.js";

it.each(["before_dispatch", "after_dispatch", "before_result", "before_state", "after_state", "cutoff"] as const)(
  "%s retains original accounting/state and never dispatches after uncertainty or cutoff",
  async (point) => {
    const cell = negotiationPlan("E3", selections).find((c) => c.family === "C06")!;
    const providers = scriptedProviders(cell);
    providers.fault = { point, actor: 0, round: 0 };
    providers.capture = ({ ledger, evidence, commands, stateVersions }) => {
      expect(commands).toEqual([]);
      expect(evidence.contracts).toEqual([]);
      if (point === "after_dispatch" || point === "before_result") {
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({ status: "unknown", tokens: "40000" });
      }
      if (point === "before_dispatch") {
        expect(ledger).toEqual(
          expect.arrayContaining([expect.objectContaining({ status: "not_dispatched", tokens: "40000" })]),
        );
      }
      if (point === "cutoff") {
        expect(ledger).toHaveLength(1);
        expect(ledger[0].status).toBe("reported");
      }
      if (point === "after_state") expect(stateVersions.some((v) => v >= 1)).toBe(true);
    };
    const result = await runNegotiationFixture(cell, providers);
    expect(result.status).not.toBe("pass");
    if (point === "after_dispatch" || point === "before_result") expect(result.cost.unknownReservedTokens).toBe(40000);
  },
  60000,
);
it("a committed game action with lost transport is resolved by its original receipt, without another command", async () => {
  const cell = negotiationPlan("E3", selections).find((c) => c.family === "C01")!;
  const providers = scriptedProviders(cell);
  providers.fault = { point: "after_commit", actor: 0, round: 0 };
  providers.capture = ({ commands, recoveries, evidence, ledger }) => {
    expect(commands).toHaveLength(1);
    expect(commands[0].state).toBe("confirmed");
    expect(recoveries).toEqual([
      expect.objectContaining({ commandId: commands[0].command_id, status: "confirmed", code: "COMMITTED" }),
    ]);
    expect(evidence.receipts.filter((r) => r.kind === "game.contact.request")).toHaveLength(1);
    expect(ledger).toHaveLength(1);
  };
  const result = await runNegotiationFixture(cell, providers);
  expect(result.status).not.toBe("pass");
}, 60000);
it("revoked supply authority prevents the requested contract and preserves the rejected attempt", async () => {
  const cell = negotiationPlan("E3", selections).find((c) => c.family === "C02")!;
  const providers: FixtureProviders = scriptedProviders(cell);
  providers.fault = { point: "revoked", actor: 0, round: 1 };
  providers.capture = ({ evidence, turns }) => {
    expect(evidence.contracts).toEqual([]);
    expect(turns.some((t) => t.code !== "WAIT") || evidence.receipts.some((r) => r.code !== "COMMITTED")).toBe(true);
  };
  expect((await runNegotiationFixture(cell, providers)).status).not.toBe("pass");
}, 60000);

it("critical false prose cannot turn valid silence into behavioral success", async () => {
  const cell = negotiationPlan("E3", selections).find((c) => c.family === "C06")!;
  const providers = scriptedProviders(cell);
  for (const provider of providers.actors) {
    const decide = provider.decide;
    provider.decide = async (r) => ({
      ...(await decide(r)),
      decision: {
        decision: { kind: "wait", summary: "The peer signed and delivered resources", ...fixtureWaitBasis(r.schema) },
      },
    });
  }
  const review = providers.review;
  providers.review = (e) => {
    const result = review(e);
    return {
      ...result,
      reviews: result.reviews.map((r) =>
        r.category === "factuality" ? { ...r, verdict: "fail", reasonCode: "INVENTED_CONSENT_AND_DELIVERY" } : r,
      ),
    };
  };
  const result = await runNegotiationFixture(cell, providers);
  expect(result.status).toBe("fail");
  expect(result.criticalFailures).toContain("MANUAL_CRITICAL_FALSE_CLAIM");
}, 60000);
