import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { definition } from "../../src/engines/continuity/engine-packing-repair.js";
import { expandFactTables } from "../../src/fact-table.js";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { runNegotiationFixture } from "../fixtures/negotiation/driver.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { scriptedProviders } from "../fixtures/negotiation/providers.js";

// Explicit candidate selected only in this offline test. Its result cannot replace
// the frozen @1 preflight or make the original E1 protocol authorize @1.1.
it.each(["C01", "C02"])(
  "separate @1.1 %s fits initial, corrective and scoped-read packets through 24 native turns",
  async (family) => {
    const cell = negotiationPlan("E1", {
      ...selections,
      selectedProfile: { id: "reactive-cognition", version: "1" },
    }).find((c) => c.family === family);
    if (!cell) throw Error("CELL_REQUIRED");
    const providers = scriptedProviders(cell, { alternating: true, correctOnce: true, learnOnce: true }),
      bytes: number[] = [];
    let correction = false,
      read = false;
    Object.assign(providers, { ownedUtcPreflight: true, candidateDefinition: definition, alternateRoles: true });
    providers.request = (detail) => {
      bytes.push(detail.inputBytes);
      expect(detail.inputBytes).toBeLessThanOrEqual(24000);
      expect(detail.maxOutputTokens).toBe(2000);
      correction ||= String(object(detail.packet.previousDecision).code).startsWith("CONTINUITY_");
      read ||=
        object(expandFactTables(detail.packet.observation)).payload !== undefined &&
        Object.hasOwn(object(object(expandFactTables(detail.packet.observation)).payload), "requestedRead");
    };
    providers.capture = ({
      failures,
      ledger,
      turns,
      selectedProfile,
      continuityNamespaces,
      outputRetries,
      evidence,
    }) => {
      console.log(
        JSON.stringify({
          schemaVersion: "fleet.negotiation-packing-candidate-preflight.v1",
          family,
          candidate: selectedProfile,
          failures,
          inputRange: [Math.min(...bytes), Math.max(...bytes)],
          allocations: ledger.length,
          turns: turns.length,
          corrective: outputRetries,
          scopedRead: read,
          memoryNamespaces: continuityNamespaces,
          installments: evidence.contracts.map((c) => c.flows.map((f) => f.installments)),
        }),
      );
      expect(selectedProfile).toEqual(definition.manifest.ref);
      expect(failures).toEqual([]);
      expect(correction || outputRetries.length === 1).toBe(true);
      expect(read).toBe(true);
      expect(ledger.length).toBeGreaterThanOrEqual(25);
      expect(ledger.length).toBeLessThanOrEqual(72);
      expect(ledger.every((l) => l.status === "reported" && Number(l.tokens) === 40000)).toBe(true);
      expect(turns).toHaveLength(24);
      expect(turns.every((t) => Number(t.calls) <= 3 && Number(t.actions) <= 1)).toBe(true);
      expect(continuityNamespaces.every((namespace) => namespace === "reactive-cognition@1.1")).toBe(true);
      if (family === "C01") expect(continuityNamespaces).toEqual(["reactive-cognition@1.1"]);
      expect(evidence.contracts).toHaveLength(1);
      expect(evidence.contracts[0].flows.map((flow) => flow.installments)).toEqual([60, 60]);
    };
    await runNegotiationFixture(cell, providers);
  },
  90000,
);
