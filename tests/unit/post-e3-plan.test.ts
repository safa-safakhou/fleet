import { expect, it } from "vitest";
import {
  assessRC1Negotiation,
  rc1MechanicallyComplete,
  summarizeRC1Negotiation,
} from "../../src/negotiation-evaluation.js";
import { prepareRC1Protocol, validateRC1Cell } from "../../src/post-e3-plan.js";
import { evidenceFixture } from "../fixtures/negotiation/evidence.js";

const selection = {
  stage: "R1-D" as const,
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("assigns a separate preregistered stage and one shared budget rather than multiplying it by four roles", () => {
  const p = prepareRC1Protocol(selection);
  expect(p.cells).toHaveLength(4);
  expect(p.maxima).toEqual({ calls: 288, reservedTokens: 11520000, wallDeadlineMs: 43200000 });
  expect(p.ready).toBe(false);
  expect(p.cells.every((c) => c.id.startsWith("negotiation-r1:R1-D:"))).toBe(true);
  expect(p.cells.every((c) => c.profile.id === "autonomous-specialists" && c.profile.version === "1")).toBe(true);
  expect(p.cells.every((c) => c.limits.turnsPerActor === 48 && c.limits.callsPerWorld === 72)).toBe(true);
  expect(p.configuration.skillMode).toBe("guarded");
  expect(p.configuration.preset).toBe("full");
  expect(p.cells.map((c) => c.rolesReversed)).toEqual([false, false, true, true]);
});

it("scores actual R1 evidence with the original material rubric and never qualifies fake or incomplete coverage", () => {
  const p = prepareRC1Protocol({ ...selection, stage: "R1-H" }),
    cell = p.cells[0],
    f = evidenceFixture();
  for (const e of [f.evidence, f.solo]) {
    e.cellId = cell.id;
    e.configurationDigest = cell.configurationDigest;
    e.initialStateDigest = cell.initialStateDigest;
  }
  const a = assessRC1Negotiation(p, cell, f.evidence, f.solo, f.reviews);
  expect(a.cell.id).toBe(cell.id);
  expect(a.evidenceLevel).toBe("fake-provider");
  expect(rc1MechanicallyComplete(p, cell, f.evidence, f.solo, f.reviews.allocations)).toBe(true);
  const withoutLater = structuredClone(f.evidence);
  withoutLater.lifecycle = withoutLater.lifecycle.filter((l) => l.stage !== "later_decision");
  expect(rc1MechanicallyComplete(p, cell, withoutLater, f.solo, f.reviews.allocations)).toBe(false);
  const s = summarizeRC1Negotiation(p, [a]);
  expect(s.assigned).toBe(35);
  expect(s.gate).toBe("incomplete");
  expect(s.productionQualified).toBe(false);
  expect(s.families["C01:default"].assigned).toBe(5);
  expect(() =>
    assessRC1Negotiation(
      p,
      { ...cell, profile: { id: "reactive-cognition", version: "2" } },
      f.evidence,
      f.solo,
      f.reviews,
    ),
  ).toThrow();
});
it("keeps fresh study seeds separate across stages and validates the complete canonical cell", () => {
  const d = prepareRC1Protocol(selection),
    h = prepareRC1Protocol({ ...selection, stage: "R1-H" }),
    n = prepareRC1Protocol({ ...selection, stage: "R1-N" });
  expect(h.cells).toHaveLength(35);
  expect(h.maxima).toEqual({ calls: 1230, reservedTokens: 49200000, wallDeadlineMs: 184500000 });
  expect(n.cells).toHaveLength(2);
  expect(n.maxima).toEqual({ calls: 144, reservedTokens: 5760000, wallDeadlineMs: 21600000 });
  expect(n.cells.every((c) => c.clockMode === "native")).toBe(true);
  expect(new Set([...d.cells, ...h.cells, ...n.cells].map((c) => c.worldSeed)).size).toBe(41);
  expect(() => validateRC1Cell(d, d.cells[0])).not.toThrow();
  expect(() => validateRC1Cell(d, { ...d.cells[0], limits: { ...d.cells[0].limits, callsPerWorld: 288 } })).toThrow();
  expect(() => validateRC1Cell(d, h.cells[0])).toThrow();
  expect(() => prepareRC1Protocol({ ...selection, stage: "E3" })).toThrow();
  expect(() => prepareRC1Protocol({ ...selection, configuration: { preset: "resources-diplomacy" } })).toThrow();
  expect(JSON.stringify(d.cells)).not.toContain(selection.seedNonce);
});
