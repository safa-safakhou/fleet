import { expect, it } from "vitest";
import { compactEnvironment, expandFactTables } from "../../src/games/pact/environment.js";

it("fits a current goal with repeated briefing facts by lossless references rather than dropping owned evidence", () => {
  const ambition = "Preserve all owner constraints. ".repeat(18);
  const buildings = [
    { kind: "farm", level: 2 },
    { kind: "barracks", level: 2 },
    { kind: "hall", level: 1 },
  ];
  const allowedActions = Array.from({ length: 20 }, (_, i) => `fixture.authorized_action_${i}`);
  const agentBriefing = {
    ownerIntent: { status: "provided", objective: ambition },
    execution: { allowedActions },
    construction: { completedBuildings: buildings },
  };
  const source = {
    ambition,
    buildings,
    authority: { allowedActions },
    agentBriefing,
    optionalHistory: "x".repeat(10000),
  };
  const packed = compactEnvironment(source, 2400);
  expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThanOrEqual(2400);
  const full = expandFactTables(packed) as typeof source;
  for (const key of ["ambition", "buildings", "authority", "agentBriefing"] as const)
    expect(full[key]).toEqual(source[key]);
  expect(source.agentBriefing.ownerIntent.objective).toBe(ambition);
});
