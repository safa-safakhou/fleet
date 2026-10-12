import { expect, it } from "vitest";
import { boundedObservation, boundedReads, mergeReads, projectRead } from "../../src/games/pact/context.js";

it("preserves complete small receipts and bounds large multibyte observations", () => {
  const receipt = { commandId: "synthetic", code: "COMMITTED" };
  expect(boundedObservation(receipt, 1000)).toBe(receipt);
  const large = { text: "界".repeat(30000), rows: Array.from({ length: 1000 }, (_, n) => ({ n })) };
  const partial = boundedObservation(large, 1000);
  expect(Buffer.byteLength(JSON.stringify(partial))).toBeLessThanOrEqual(1000);
  expect(JSON.stringify(partial)).toContain("originalBytes");
  const reads = boundedReads([
    { tool: "unknown", result: large },
    { tool: "receipt", result: receipt },
  ]);
  expect(Buffer.byteLength(JSON.stringify(reads))).toBeLessThanOrEqual(12000);
  expect(reads.find((r) => r.tool === "receipt")?.result).toEqual(receipt);
});

it("retains whole candidates behind large leading metadata and preserves them across checkpoint compaction", () => {
  const candidates = Array.from({ length: 20 }, (_, n) => ({
    id: `candidate-${n}`,
    action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
    checks: { affordable: true, prerequisites: ["hall:1"] },
    effects: { cost: { iron: "240", silver: "120" }, explanation: "x".repeat(600) },
  }));
  const entry = {
    tool: "pact_decision_support_v2",
    args: {},
    observedAt: "2026-10-11T12:00:00Z",
    result: { schemaVersion: "fixture", forecast: { text: "x".repeat(20000) }, candidates },
  };
  const projected = projectRead(entry);
  const retained = (projected.result as { candidates: typeof candidates }).candidates;
  expect(retained.length).toBeGreaterThan(0);
  expect(retained.length).toBeLessThan(20);
  expect(retained[0]).toEqual(candidates[0]);
  expect((projected.result as { candidateIndex: unknown[] }).candidateIndex).toHaveLength(20);
  expect(projectRead(projected)).toEqual(projected);
  const memory = mergeReads([
    projected,
    {
      tool: "pact_agent_guide_v1",
      args: { topic: "diplomacy" },
      result: { firstContact: "Use actual observed identities" },
    },
  ]);
  expect(JSON.stringify(boundedReads(memory))).toContain("candidate-0");
  expect(JSON.stringify(boundedReads(memory))).not.toContain("partialObservation");
});

it("preserves complete public parties and rule knowledge while repeated state reads deduplicate", () => {
  const parties = Object.fromEntries(
    Array.from({ length: 20 }, (_, n) => [
      `kingdom-${n}`,
      { character: { name: `Player ${n}`, biography: "x".repeat(500) }, ruler: { displayName: `Ruler ${n}` } },
    ]),
  );
  const projected = projectRead({
    tool: "pact_play_view_v1",
    args: {},
    result: { world: { text: "x".repeat(20000) }, parties },
  });
  const kept = (projected.result as { parties: typeof parties }).parties;
  expect(Object.keys(kept).length).toBeGreaterThan(0);
  expect(kept["kingdom-0"]).toEqual(parties["kingdom-0"]);
  expect((projected.result as { partyIndex: unknown[] }).partyIndex).toHaveLength(20);
  const rules = {
    tool: "pact_agent_guide_v1",
    args: { topic: "diplomacy" },
    result: { firstContact: "Free introductions", discovery: "Read public authors" },
  };
  const memory = mergeReads([
    rules,
    ...Array.from({ length: 20 }, (_, n) => ({ tool: "pact_decision_support_v2", args: {}, result: { sequence: n } })),
  ]);
  expect(memory).toHaveLength(2);
  expect(memory[0]).toEqual(rules);
  expect((memory[1].result as { sequence: number }).sequence).toBe(19);
});
