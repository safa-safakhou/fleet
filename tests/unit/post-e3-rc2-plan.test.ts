import { expect, it } from "vitest";
import { assessRC2Negotiation } from "../../src/negotiation-evaluation.js";
import { prepareRC1Protocol } from "../../src/post-e3-plan.js";
import { prepareRC2Protocol, validateRC2Cell } from "../../src/post-e3-rc2-plan.js";
import { evidenceFixture } from "../fixtures/negotiation/evidence.js";

const input = {
  stage: "R2-D" as const,
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  settingsDigest: "e".repeat(64),
  bundleDigest: "f".repeat(64),
  seedNonce: "1".repeat(64),
  batchNonce: "123e4567-e89b-42d3-a456-426614174000",
};
it("isolates the 32000-byte RC2 candidate and fresh seeds without expanding calls, tokens, time, output or actor behavior", () => {
  const p = prepareRC2Protocol(input),
    old = prepareRC1Protocol({ ...input, stage: "R1-D" });
  expect(p.study).toBe("negotiation-r2");
  expect(p.schemaVersion).toBe("fleet.rc2-protocol.v1");
  expect(p.native.inputBytes).toBe(32000);
  expect(p.native.periodicMinutes).toBe(30);
  expect(p.maxima).toEqual(old.maxima);
  expect(p.configuration).toEqual(old.configuration);
  expect(
    p.cells.every(
      (c) =>
        c.limits.inputBytes === 32000 &&
        c.limits.callsPerWorld === 72 &&
        c.profile.id === "autonomous-specialists" &&
        c.profile.version === "1",
    ),
  ).toBe(true);
  expect(p.cells.map((c) => c.id)).not.toEqual(old.cells.map((c) => c.id));
  expect(p.cells.map((c) => c.worldSeed)).not.toEqual(old.cells.map((c) => c.worldSeed));
  expect(old.cells.every((c) => c.limits.inputBytes === 24000)).toBe(true);
  expect(() => validateRC2Cell(p, { ...p.cells[0], limits: { ...p.cells[0].limits, inputBytes: 40000 } })).toThrow();
  expect(() => prepareRC2Protocol({ ...input, stage: "R1-D" })).toThrow();
  expect(prepareRC2Protocol({ ...input, stage: "R2-H" }).cells).toHaveLength(35);
  expect(prepareRC2Protocol({ ...input, stage: "R2-N" }).maxima.calls).toBe(144);
});

it("measures the later-decision latency only after actual closure for both kingdoms", () => {
  const p = prepareRC2Protocol(input),
    cell = p.cells[0],
    f = evidenceFixture();
  for (const e of [f.evidence, f.solo]) {
    e.cellId = cell.id;
    e.configurationDigest = cell.configurationDigest;
    e.initialStateDigest = cell.initialStateDigest;
  }
  const first = f.evidence.lifecycle[0];
  if (!first) throw Error("FIXTURE");
  for (const l of f.evidence.lifecycle)
    if (l.stage === "later_decision" && l.actorId === f.evidence.actors[1].actorId)
      l.wallTime = "2026-10-20T02:05:00.000Z";
  f.evidence.lifecycle.unshift({ ...first, stage: "later_decision", gameTimeMs: "0", wallTime: first.wallTime });
  const a = assessRC2Negotiation(p, cell, f.evidence, f.solo, f.reviews);
  const expected = Date.parse("2026-10-20T02:05:00.000Z") - Date.parse(first.wallTime);
  expect(a.latencyMs.later_decision).toBe(expected);
  f.evidence.contracts = [];
  expect(assessRC2Negotiation(p, cell, f.evidence, f.solo, f.reviews).latencyMs.later_decision).toBeNull();
});
