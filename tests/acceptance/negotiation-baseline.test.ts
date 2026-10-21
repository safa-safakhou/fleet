import { expect, it } from "vitest";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { type FixtureProviders, runNegotiationFixture } from "../fixtures/negotiation/driver.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { scriptedProviders } from "../fixtures/negotiation/providers.js";

// This is a regression for a FAILED readiness preflight. Passing these assertions
// proves zero-spend fencing, not that E1 is launchable. Do not replace @1 or its caps.
it.each(["C01", "C02"])(
  "owned UTC @1 %s preflight retains CONTEXT_LIMIT before provider dispatch",
  async (family) => {
    const cell = negotiationPlan("E1", {
      ...selections,
      selectedProfile: { id: "reactive-cognition", version: "1" },
    }).find((c) => c.family === family)!;
    const providers = scriptedProviders(cell),
      started = Date.now();
    const packing: Parameters<NonNullable<FixtureProviders["packing"]>>[0][] = [];
    Object.assign(providers, { ownedUtcPreflight: true, maxRounds: 1, skipSettlement: true });
    providers.packing = (detail) => packing.push(detail);
    providers.capture = ({ failures, ledger, packets, turns, commands }) => {
      expect(failures).toEqual(["CONTEXT_LIMIT", "CONTEXT_LIMIT"]);
      expect(ledger).toEqual([]);
      expect(packets).toEqual([]);
      expect(commands).toEqual([]);
      expect(turns).toHaveLength(2);
      expect(turns.every((t) => t.code === "CONTEXT_LIMIT" && t.calls === 0 && t.actions === 0)).toBe(true);
      expect(turns.every((t) => new Date(String(t.started_at)).getTime() >= started)).toBe(true);
      expect(
        turns.every(
          (t) => new Date(String(t.deadline_at)).getTime() - new Date(String(t.started_at)).getTime() <= 120000,
        ),
      ).toBe(true);
      for (const actor of [0, 1]) {
        const attempts = packing.filter((p) => p.actor === actor);
        expect(attempts.length).toBeGreaterThan(0);
        expect(attempts.every((p) => p.error === "CONTEXT_LIMIT" && p.packedBytes === null)).toBe(true);
        console.log(
          JSON.stringify({
            schemaVersion: "fleet.negotiation-packet-preflight.v1",
            family,
            actor,
            profile: cell.profile,
            ready: false,
            clock: "actual-utc",
            failure: "CONTEXT_LIMIT",
            observationBytes: attempts[0].observationBytes,
            maximumObservationAllowance: Math.max(...attempts.map((p) => p.allowance)),
            packingAttempts: attempts.length,
            inputCeiling: 24000,
            outputCeiling: 2000,
            providerCalls: 0,
            allocations: 0,
            actions: 0,
            correctiveAndReadPackets: "blocked_by_initial_packet",
          }),
        );
      }
    };
    const result = await runNegotiationFixture(cell, providers);
    expect(result.status).not.toBe("pass");
    expect(result.evidenceLevel).toBe("fake-provider");
  },
  60000,
);
