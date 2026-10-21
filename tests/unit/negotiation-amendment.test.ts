import { expect, it } from "vitest";
import { builtinArchitectures } from "../../src/app/builtins.js";
import { designDigest, negotiationBaselineAmendment, negotiationPlan } from "../../src/negotiation-plan.js";
import { prepareNegotiationProtocol } from "../../src/negotiation-run.js";

const selection = {
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  selectedProfile: { id: "reactive-cognition", version: "1" },
};
it("adopts the explicitly approved packing baseline without relabelling original cells or budgets", () => {
  const original = negotiationPlan("E1", selection);
  const baselineAmendment = designDigest(negotiationBaselineAmendment);
  const amended = negotiationPlan("E1", { ...selection, baselineAmendment });
  expect(original.every((c) => c.profile.version === "1")).toBe(true);
  expect(amended.every((c) => c.profile.version === "1.1" && c.id.includes(":v1.1:"))).toBe(true);
  expect(amended.map((c) => c.limits)).toEqual(original.map((c) => c.limits));
  expect(amended.map((c) => c.initialStateDigest)).toEqual(original.map((c) => c.initialStateDigest));
  expect(amended.every((c, i) => c.configurationDigest !== original[i].configurationDigest)).toBe(true);
  expect(new Set(negotiationPlan("E2", { ...selection, baselineAmendment }).map((c) => c.profile.version))).toEqual(
    new Set(["1.1", "2"]),
  );
  expect(builtinArchitectures().resolve({ id: "reactive-cognition", version: "1.1" }).manifest.ref.version).toBe("1.1");
  const preview = prepareNegotiationProtocol({ ...selection, baselineAmendment, settingsDigest: "e".repeat(64) });
  expect(preview.cells.map((c) => c.profile)).toEqual(amended.map((c) => c.profile));
  expect(preview.realProviderAuthorized).toBe(false);
  expect(() => negotiationPlan("E1", { ...selection, baselineAmendment: "0".repeat(64) })).toThrow(
    "BASELINE_AMENDMENT_REQUIRED",
  );
  expect(() =>
    negotiationPlan("E3", { ...selection, selectedProfile: { id: "reactive-cognition", version: "1.1" } }),
  ).toThrow("BASELINE_AMENDMENT_REQUIRED");
});
