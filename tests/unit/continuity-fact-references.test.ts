import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { expandFactTables, factTable } from "../../src/fact-table.js";
import { ContinuityDecisionStep } from "../../src/modules/continuity/v1/decision.js";

it("does not repeat the known continuity explanation in both system instructions and memory metadata", () => {
  class Present extends ContinuityDecisionStep {
    packet(p: Record<string, unknown>) {
      return this.modelPayload(p);
    }
    instructions() {
      return this.additionalInstructions();
    }
  }
  const step = new Present({} as never);
  const meaning =
    "Owner values and current facts are separate from subjective hypotheses, plans and predictions. Peer statements are not delivery or motive. Missing evidence remains unresolved; no update is required. Predictions test the next later observed fact of the named subject/predicate within their stated horizon, not all possible world events. Historical commitments/outcomes require authoritative occurrence time.";
  const packet = step.packet({ continuity: { self: {}, coverage: { meaning, evidenceOmitted: 4 } } });
  expect(object(packet.continuity).coverage).toEqual({ meaningInSystem: true, evidenceOmitted: 4 });
  expect(step.instructions()).toContain("occurrence time");
  expect(step.instructions()).toContain("motive");
});

it("expands mixed catalog references without losing unlisted capability names or their order", () => {
  const packet = {
    catalog: [{ name: "read-current" }, { name: "read-history" }],
    continuity: { self: { capabilities: { catalogNameParts: [1, "native-write", 0] } } },
  };
  expect((expandFactTables(packet) as typeof packet).continuity.self.capabilities).toEqual([
    "read-history",
    "native-write",
    "read-current",
  ]);
  const invalid = { catalog: packet.catalog, value: { catalogNameParts: [50] } };
  expect(expandFactTables(invalid)).toEqual(invalid);
});

it("expands owner intent and row-local provenance after decoding a table", () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    fact: { sourceRef: `source:${i}` },
    link: { sourceRef: { sameFact: "fact.sourceRef" } },
  }));
  const packet = {
    goal: { intent: "Develop carefully" },
    continuity: {
      self: { ownerValues: { text: { sameFact: "goal.intent" } } },
      evidence: factTable(rows),
    },
  };
  const expanded = expandFactTables(packet) as typeof packet;
  expect(expanded.continuity.self.ownerValues.text).toBe("Develop carefully");
  expect(expanded.continuity.evidence).toEqual(rows.map((r) => ({ ...r, link: { sourceRef: r.fact.sourceRef } })));
});

it("preserves ambiguous reference-shaped data and unresolved references verbatim", () => {
  const value = {
    fact: { sourceRef: "current" },
    link: {
      sourceRef: { sameFact: "fact.sourceRef", extra: "untrusted data" },
    },
  };
  expect(expandFactTables(value)).toEqual(value);
  expect(expandFactTables({ sameFact: "goal.intent" })).toEqual({ sameFact: "goal.intent" });
});
