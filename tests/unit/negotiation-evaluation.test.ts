import { expect, it } from "vitest";
import { assessNegotiation, summarizeNegotiation } from "../../src/negotiation-evaluation.js";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { evidenceFixture, selections } from "../fixtures/negotiation/evidence.js";

function assess(f = evidenceFixture()) {
  return assessNegotiation(f.cell, f.evidence, f.solo, f.reviews);
}
it("mutual fulfillment plus useful dialogue and both later decisions passes", () => {
  const r = assess();
  expect(r).toMatchObject({ status: "pass", material: "pass", communication: "pass", history: "pass" });
  expect(r.cost).toMatchObject({ allocations: 1, reservedTokens: 40000, measuredTokens: 15, unknownReservedTokens: 0 });
});
it.each(["peer", "consent", "partial", "default", "outgoing", "horizon", "coverage", "followup", "calls"])(
  "%s cannot pass",
  (kind) => {
    const f = evidenceFixture();
    if (kind === "peer") f.evidence.offers[0].kingdomB = "other";
    if (kind === "consent") f.evidence.offers[0].signedBy = ["A"];
    if (kind === "partial") f.evidence.contracts[0].flows[0].deliveredUnits = "100";
    if (kind === "default") f.evidence.contracts[0].status = "defaulted";
    if (kind === "outgoing") f.evidence.actors[0].ordinaryFinal.iron = "0";
    if (kind === "horizon") f.solo.horizonGameTimeMs = "1";
    if (kind === "coverage") f.evidence.coverage.complete = false;
    if (kind === "followup")
      f.evidence.lifecycle = f.evidence.lifecycle.filter((l) => !(l.stage === "later_decision" && l.actorId === "B"));
    if (kind === "calls")
      f.reviews.allocations = Array.from({ length: 73 }, (_, i) => ({
        ...f.reviews.allocations[0],
        id: `a${i}`,
        turnId: `t${i}`,
      }));
    expect(assess(f).status).not.toBe("pass");
  },
);
it("invented income and wrong peer claims fail even when material succeeds", () => {
  const f = evidenceFixture();
  f.reviews.claims = [
    { kind: "income", actorId: "A", recordId: "offer", version: 2, peerId: "B", resource: "silver", units: "600" },
  ];
  const r = assess(f);
  expect(r.status).toBe("fail");
  expect(r.criticalFailures).toContain("FALSE_INCOME");
});
it("material success without dialogue is incomplete; unassessable prose stays unresolved", () => {
  const f = evidenceFixture();
  f.reviews.reviews = f.reviews.reviews.filter((r) => r.category !== "dialogue");
  const r = assess(f);
  expect(r.material).toBe("pass");
  expect(r.status).toBe("unresolved");
});
it.each(["C03", "C04", "C06"])("%s permits supported refusal or silence without chat quota", (family) => {
  const f = evidenceFixture(family, family === "C04" ? "expired" : "default");
  f.evidence.contracts = [];
  f.evidence.offers = [];
  f.evidence.actors.forEach((a, i) => {
    a.ordinaryFinal = { ...f.solo.actors[i].ordinaryFinal };
  });
  f.reviews.reviews = f.reviews.reviews.map((r) => ({
    ...r,
    category: r.category === "dialogue" ? "control" : r.category,
  }));
  expect(assess(f).status).toBe("pass");
});
it("unknown original reservations remain and zero useful outcomes has null cost", () => {
  const f = evidenceFixture();
  f.reviews.allocations = [
    {
      id: "unknown",
      actorId: "A",
      turnId: "turn1",
      reservedTokens: 40000,
      inputTokens: null,
      outputTokens: null,
      status: "unknown",
    },
  ];
  const r = assess(f);
  expect(r.cost.unknownReservedTokens).toBe(40000);
  expect(r.status).not.toBe("pass");
  const s = summarizeNegotiation([r]);
  expect(s.costPerUsefulOutcome).toBeNull();
  expect(s.gate).not.toBe("pass");
});
it("summary rejects duplicate worlds, mixed evidence levels and private text", () => {
  const a = assess();
  expect(() => summarizeNegotiation([a, a])).toThrow();
  const b = structuredClone(a);
  b.worldId = "other";
  b.evidenceLevel = "real-provider";
  expect(() => summarizeNegotiation([a, b])).toThrow();
  const f = evidenceFixture();
  (f.reviews as unknown as Record<string, unknown>).rawText = "secret";
  expect(() => assess(f)).toThrow();
});

it("held-out thresholds keep all 35 assigned worlds, family floors and zero-critical requirement", () => {
  const base = assess();
  const rows = negotiationPlan("E3", selections).map((cell, i) => ({
    ...structuredClone(base),
    cell,
    worldId: `world${i}`,
  }));
  const full = summarizeNegotiation(rows);
  expect(full).toMatchObject({ assigned: 35, passed: 35, complete: true, gate: "offline_only" });
  expect(full.families["C01:default"].wilson95[0]).toBeCloseTo(0.5655, 3);
  const positives = rows.filter((a) => a.cell.family === "C01");
  positives[0].status = "fail";
  expect(summarizeNegotiation(rows).gate).toBe("offline_only");
  positives[1].status = "fail";
  expect(summarizeNegotiation(rows).gate).toBe("fail");
  positives[1].status = "pass";
  rows.find((a) => a.cell.family === "C06")!.status = "fail";
  expect(summarizeNegotiation(rows).gate).toBe("fail");
  rows.find((a) => a.cell.family === "C06")!.status = "pass";
  rows[0].criticalFailures.push("FALSE_CONSENT");
  expect(summarizeNegotiation(rows).gate).toBe("fail");
  expect(summarizeNegotiation(rows.slice(1)).gate).toBe("incomplete");
});
it("corrective allocations are counted once; forged goal and unsupported review cannot pass", () => {
  const f = evidenceFixture();
  f.reviews.allocations.push({ ...f.reviews.allocations[0], id: "correction" });
  expect(assess(f).cost).toMatchObject({ allocations: 2, reservedTokens: 80000, measuredTokens: 30 });
  f.reviews.allocations.push({ ...f.reviews.allocations[0] });
  expect(() => assess(f)).toThrow("DUPLICATE_ALLOCATION");
  f.reviews.allocations.pop();
  f.evidence.actors[0].goalDigest = "0".repeat(64);
  f.solo.actors[0].goalDigest = "0".repeat(64);
  expect(assess(f).status).toBe("fail");
});
