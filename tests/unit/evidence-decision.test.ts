import { expect, it } from "vitest";
import { evidenceDecisionContract, validateEvidenceDecision } from "../../src/platform/evidence-decision.js";

const evidence = {
  bindingId: "kingdom-a",
  revision: "snapshot-7",
  choices: ["offer-b", "wait"],
  facts: [
    { id: "gold", state: "known" as const, value: "120" },
    { id: "available", state: "known" as const, value: "100" },
    { id: "delivery", state: "unknown" as const },
  ],
  requiredFacts: ["gold", "available", "delivery"],
};
const decision = {
  bindingId: "kingdom-a",
  revision: "snapshot-7",
  choiceId: "offer-b",
  factIds: ["gold", "available", "delivery"],
};
it("renders only trusted typed evidence, including honest unknown state", () => {
  expect(evidenceDecisionContract(evidence).properties.bindingId).toEqual({ const: "kingdom-a" });
  expect(validateEvidenceDecision(decision, evidence)).toEqual({
    bindingId: "kingdom-a",
    revision: "snapshot-7",
    choiceId: "offer-b",
    facts: evidence.facts,
    summary:
      'Observed evidence: [{"id":"gold","state":"known","value":"120"},{"id":"available","state":"known","value":"100"},{"id":"delivery","state":"unknown"}]',
  });
});
it.each([
  [{ ...decision, bindingId: "foreign" }, "DECISION_BINDING_MISMATCH"],
  [{ ...decision, revision: "stale" }, "DECISION_REVISION_MISMATCH"],
  [{ ...decision, choiceId: "offer-a" }, "DECISION_CHOICE_UNAVAILABLE"],
  [{ ...decision, factIds: ["gold", "invented"] }, "DECISION_FACT_UNAVAILABLE"],
  [{ ...decision, factIds: ["gold"] }, "DECISION_FACT_REQUIRED"],
  [{ ...decision, summary: "The offer has been accepted and delivered." }, "DECISION_EVIDENCE_SHAPE"],
  [{ ...decision, claims: { available: "999" } }, "DECISION_EVIDENCE_SHAPE"],
])("rejects untrusted model evidence %j", (value, code) => {
  expect(() => validateEvidenceDecision(value, evidence)).toThrow(code);
});

it("uses exact synthetic oracle arithmetic and preserves different kingdom scopes", async () => {
  const { kingdomEvidenceCases } = await import("../fixtures/kingdom-evidence-cases.js");
  const cases = kingdomEvidenceCases();
  expect(cases.map((c) => c.expectedChoice)).toEqual(["kingdom-a:b", "kingdom-b:a", "wait", "kingdom-d:b"]);
  expect(cases[3].evidence.facts.find((f) => f.id === "spendable")).toEqual({
    id: "spendable",
    state: "known",
    value: "100",
  });
  for (const selected of cases) {
    const decision = {
      bindingId: selected.evidence.bindingId,
      revision: selected.evidence.revision,
      choiceId: selected.expectedChoice,
      factIds: selected.evidence.requiredFacts,
    };
    expect(validateEvidenceDecision(decision, selected.evidence).choiceId).toBe(selected.expectedChoice);
    const foreign = cases.find((c) => c.input.id !== selected.input.id);
    expect(() => validateEvidenceDecision({ ...decision, bindingId: foreign?.input.id }, selected.evidence)).toThrow(
      "DECISION_BINDING_MISMATCH",
    );
  }
});

it("refuses empty or oversized trusted evidence before constructing a model contract", () => {
  expect(() => evidenceDecisionContract({ ...evidence, facts: [], requiredFacts: [] })).toThrow(
    "DECISION_EVIDENCE_INVALID",
  );
  expect(() =>
    evidenceDecisionContract({
      ...evidence,
      facts: [{ id: "large", state: "known", value: "x".repeat(17000) }],
      requiredFacts: ["large"],
    }),
  ).toThrow("DECISION_EVIDENCE_INVALID");
});

it("uses a portable generation grammar while enforcing citation uniqueness in the host", () => {
  expect(evidenceDecisionContract(evidence).properties.factIds).not.toHaveProperty("uniqueItems");
  expect(() =>
    validateEvidenceDecision({ ...decision, factIds: ["gold", "gold", "available", "delivery"] }, evidence),
  ).toThrow("DECISION_EVIDENCE_SHAPE");
});

it("enforces an explicit numeric objective with exact scores and permits ties", () => {
  const scored = {
    ...evidence,
    choices: ["a", "b", "wait"],
    choicePolicy: {
      kind: "maximize_integer" as const,
      scores: { a: "9007199254740993002", b: "9007199254740993001", wait: "0" },
    },
  };
  expect(evidenceDecisionContract(scored).properties.choiceId.enum).toEqual(["a"]);
  expect(() => validateEvidenceDecision({ ...decision, choiceId: "b" }, scored)).toThrow(
    "DECISION_OBJECTIVE_VIOLATION",
  );
  const tied = {
    ...scored,
    choicePolicy: { kind: "maximize_integer" as const, scores: { a: "77", b: "77", wait: "0" } },
  };
  expect(evidenceDecisionContract(tied).properties.choiceId.enum).toEqual(["a", "b"]);
  expect(validateEvidenceDecision({ ...decision, choiceId: "b" }, tied).choiceId).toBe("b");
});
it("refuses incomplete or noninteger objective scores", () => {
  const invalid: Array<Record<string, string>> = [{ a: "1" }, { "offer-b": "1.5", wait: "0" }];
  for (const scores of invalid)
    expect(() => evidenceDecisionContract({ ...evidence, choicePolicy: { kind: "maximize_integer", scores } })).toThrow(
      "DECISION_EVIDENCE_INVALID",
    );
});

it("scores held-out objectives without hardcoding an answer or discarding tied choices", async () => {
  const { heldOutKingdomEvidenceCases } = await import("../fixtures/kingdom-evidence-cases.js");
  expect(heldOutKingdomEvidenceCases().map((c) => c.expectedChoices)).toEqual([
    ["kingdom-e:a", "kingdom-e:b"],
    ["kingdom-f:b"],
    ["wait"],
    ["kingdom-h:b"],
  ]);
  for (const selected of [...heldOutKingdomEvidenceCases(), ...heldOutKingdomEvidenceCases(true)])
    expect(evidenceDecisionContract(selected.evidence).properties.choiceId.enum).toEqual(selected.expectedChoices);
});
