import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { expandFactTables } from "../../src/fact-table.js";
import { assessNegotiation } from "../../src/negotiation-evaluation.js";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { runNegotiationFixture } from "../fixtures/negotiation/driver.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { scriptedProviders } from "../fixtures/negotiation/providers.js";

it("two actual selected engines establish contact/dialogue, settle 60 installments each, then decide later", async () => {
  const cell = negotiationPlan("E3", selections).find((c) => c.family === "C01")!;
  const providers = scriptedProviders(cell);
  providers.capture = ({ evidence, solo, ledger, packets }) => {
    expect(
      packets.some((p) => {
        const data = object(object(expandFactTables(p.observation)).payload);
        return (
          object(object(data.world ?? data.environment).profile).kingdomId === evidence.actors[1].actorId &&
          JSON.stringify(data.requestedRead ?? {}).includes("I need 1 Silver/hour and can send 2 Iron/hour")
        );
      }),
    ).toBe(true);
    expect(evidence.contracts[0]?.flows.map((f) => f.installments)).toEqual([60, 60]);
    expect(
      evidence.actors.map((a, i) =>
        (
          BigInt(a.ordinaryFinal[i === 0 ? "silver" : "iron"]) -
          BigInt(solo.actors[i].ordinaryFinal[i === 0 ? "silver" : "iron"])
        ).toString(),
      ),
    ).toEqual(["600", "1200"]);
    expect(ledger.length).toBeLessThanOrEqual(72);
    const reviews = { evidenceLevel: "fake-provider", allocations: [], ...providers.review(evidence) };
    for (const mutate of [
      (e: typeof evidence) => {
        e.offers[0].kingdomB = "wrong-peer";
      },
      (e: typeof evidence) => {
        e.offers[0].signedBy = [];
      },
      (e: typeof evidence) => {
        e.contracts[0].flows[0].deliveredUnits = "0";
      },
    ]) {
      const changed = structuredClone(evidence);
      mutate(changed);
      expect(assessNegotiation(cell, changed, solo, reviews).status).not.toBe("pass");
    }
  };
  const result = await runNegotiationFixture(cell, providers);
  expect(result).toMatchObject({
    status: "pass",
    material: "pass",
    communication: "pass",
    history: "pass",
    evidenceLevel: "fake-provider",
  });
  expect(result.criticalFailures).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("I need 1 Silver/hour");
}, 60000);

it.each([
  ["C02", "default"],
  ["C03", "default"],
  ["C04", "expired"],
  ["C05", "fulfilled"],
  ["C05", "default"],
  ["C06", "default"],
])(
  "%s %s follows normal paired handlers and grounded later decisions",
  async (family, variant) => {
    const cell = negotiationPlan("E3", selections).find((c) => c.family === family && c.variant === variant)!;
    const providers = scriptedProviders(cell);
    providers.capture = ({ evidence, solo, ledger, packets }) => {
      expect(
        evidence.lifecycle.filter((l) => l.stage === "later_decision" && !l.scriptedPrefix).length,
      ).toBeGreaterThanOrEqual(2);
      expect(ledger.length).toBeLessThanOrEqual(cell.limits.callsPerWorld);
      if (family === "C02") {
        expect(
          packets.some((p) => {
            const data = object(object(expandFactTables(p.observation)).payload);
            return (
              object(object(data.world ?? data.environment).profile).kingdomId === evidence.actors[1].actorId &&
              JSON.stringify(data.requestedRead ?? {}).includes("My current owner limit is 2 Iron/hour")
            );
          }),
        ).toBe(true);
        expect(evidence.offers.some((o) => o.version === 2 && o.signedBy.length === 2)).toBe(true);
        expect(evidence.contracts[0].flows.every((f) => f.installments === 60)).toBe(true);
      }
      // Mutations of an actual exported fixture cannot inherit its passing assessment.
      const reviews = { evidenceLevel: "fake-provider", allocations: [], ...providers.review(evidence) };
      for (const mutate of [
        (e: typeof evidence) => {
          e.actors[0].goalDigest = "0".repeat(64);
        },
        (e: typeof evidence) => {
          e.coverage.complete = false;
        },
      ]) {
        const changed = structuredClone(evidence);
        mutate(changed);
        expect(assessNegotiation(cell, changed, solo, reviews).status).not.toBe("pass");
      }
    };
    const result = await runNegotiationFixture(cell, providers);
    expect(result.status).toBe("pass");
    expect(result.criticalFailures).toEqual([]);
  },
  60000,
);
it("F6 cannot be substituted into the preregistered negotiation cells", async () => {
  const original = negotiationPlan("E3", selections)[0];
  const invalid = { ...original, profile: { id: "specialist-coordinator", version: "1" } };
  await expect(runNegotiationFixture(invalid, scriptedProviders(original))).rejects.toThrow();
});
