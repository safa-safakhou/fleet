import { expect, it } from "vitest";
import { pactContinuity } from "../../src/games/pact/outlook.js";
import sample from "../fixtures/environments/pact-outlook.json" with { type: "json" };

it("maps the actual synthetic P2 snapshot without conflating fulfilled help and a lost battle", () => {
  const mapped = pactContinuity(sample, sample.ownerRef),
    facts = mapped.continuity.facts;
  expect(
    facts.some((f) => f.kind === "commitment" && f.value === "fulfilled" && f.occurredAt?.value === "3600000"),
  ).toBe(true);
  expect(facts.some((f) => f.kind === "outcome" && f.value === "lost" && f.occurredAt?.value === "1200000")).toBe(true);
  expect(mapped.continuity.self.ownerValues).toEqual({ text: sample.ownerValues });
  expect(facts.every((f) => mapped.sourceRefs.includes(f.sourceRef))).toBe(true);
  expect(() => pactContinuity(sample, "00000000-0000-4000-8000-000000000000")).toThrow("IDENTITY_MISMATCH");
  expect(() => pactContinuity({ ...sample, schemaVersion: "future" }, sample.ownerRef)).toThrow("INVALID_OUTLOOK");
});
