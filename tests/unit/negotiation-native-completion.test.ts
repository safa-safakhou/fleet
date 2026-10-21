import { expect, it } from "vitest";
import { nativeCompletionReady } from "../../scripts/lib/negotiation-native-run.js";
import { assessNegotiation } from "../../src/negotiation-evaluation.js";
import { negotiationPlan } from "../../src/negotiation-plan.js";
import { evidenceFixture, selections } from "../fixtures/negotiation/evidence.js";

function sample() {
  const f = evidenceFixture(),
    cell = negotiationPlan("E4", selections)[0];
  for (const e of [f.evidence, f.solo]) {
    e.cellId = cell.id;
    e.configurationDigest = cell.configurationDigest;
    e.initialStateDigest = cell.initialStateDigest;
  }
  return { ...f, cell };
}
it("mechanical native completion never replaces manual outcome review", () => {
  const f = sample();
  expect(nativeCompletionReady(f.cell, f.evidence, f.solo, f.reviews.allocations)).toBe(true);
  expect(
    assessNegotiation(f.cell, f.evidence, f.solo, {
      evidenceLevel: "fake-provider",
      allocations: f.reviews.allocations,
      claims: [],
      reviews: [],
    }).status,
  ).toBe("unresolved");
  for (const missing of ["installment", "later", "dialogue", "matched"]) {
    const x = sample();
    if (missing === "installment") x.evidence.contracts[0].flows[0].installments = 59;
    if (missing === "later")
      x.evidence.lifecycle = x.evidence.lifecycle.filter((l) => l.stage !== "later_decision" || l.actorId !== "B");
    if (missing === "dialogue") x.evidence.lifecycle = x.evidence.lifecycle.filter((l) => l.stage !== "dialogue");
    if (missing === "matched") x.solo.horizonGameTimeMs = "10860000";
    expect(nativeCompletionReady(x.cell, x.evidence, x.solo, x.reviews.allocations)).toBe(false);
  }
});
