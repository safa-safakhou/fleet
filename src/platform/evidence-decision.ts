import { z } from "zod";
import { FleetError, object } from "../domain.js";

const id = z.string().min(1).max(160);
const fact = z.discriminatedUnion("state", [
  z.object({ id, state: z.literal("known"), value: z.json() }).strict(),
  z.object({ id, state: z.literal("unknown") }).strict(),
  z.object({ id, state: z.literal("pending") }).strict(),
]);
const evidenceSchema = z
  .object({
    bindingId: id,
    revision: id,
    choices: z.array(id).min(1).max(64),
    facts: z.array(fact).min(1).max(32),
    requiredFacts: z.array(id).max(32),
    choicePolicy: z
      .object({
        kind: z.literal("maximize_integer"),
        scores: z.record(
          id,
          z
            .string()
            .max(100)
            .regex(/^-?(0|[1-9][0-9]*)$/),
        ),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const facts = new Set(e.facts.map((f) => f.id));
    const policy = e.choicePolicy;
    if (
      Buffer.byteLength(JSON.stringify(e)) > 16000 ||
      facts.size !== e.facts.length ||
      new Set(e.choices).size !== e.choices.length ||
      new Set(e.requiredFacts).size !== e.requiredFacts.length ||
      e.requiredFacts.some((f) => !facts.has(f)) ||
      (policy &&
        (Object.keys(policy.scores).length !== e.choices.length ||
          e.choices.some((id) => !Object.hasOwn(policy.scores, id))))
    )
      ctx.addIssue({ code: "custom", message: "Invalid evidence references" });
  });
export type DecisionEvidence = z.infer<typeof evidenceSchema>;
function permittedChoices(e: DecisionEvidence) {
  if (!e.choicePolicy) return e.choices;
  const scores = e.choicePolicy.scores;
  const best = e.choices.reduce(
    (value, id) => (BigInt(scores[id]) > value ? BigInt(scores[id]) : value),
    BigInt(scores[e.choices[0]]),
  );
  return e.choices.filter((id) => BigInt(scores[id]) === best);
}
function checked(evidence: DecisionEvidence) {
  const parsed = evidenceSchema.safeParse(evidence);
  if (!parsed.success) throw new FleetError("DECISION_EVIDENCE_INVALID", true);
  return parsed.data;
}
/** Host scope and observed facts are not authored by the model. No free-text claims are accepted. */
export function evidenceDecisionContract(evidence: DecisionEvidence) {
  const e = checked(evidence);
  return {
    type: "object",
    additionalProperties: false,
    required: ["bindingId", "revision", "choiceId", "factIds"],
    properties: {
      bindingId: { const: e.bindingId },
      revision: { const: e.revision },
      choiceId: { type: "string", enum: permittedChoices(e) },
      factIds: {
        type: "array",
        items: { type: "string", enum: e.facts.map((f) => f.id) },
        maxItems: e.facts.length,
      },
    },
  };
}
export function validateEvidenceDecision(value: unknown, evidence: DecisionEvidence) {
  const e = checked(evidence),
    decision = object(value);
  if (
    Object.keys(decision).some((k) => !["bindingId", "revision", "choiceId", "factIds"].includes(k)) ||
    !Array.isArray(decision.factIds) ||
    decision.factIds.some((id) => typeof id !== "string") ||
    new Set(decision.factIds).size !== decision.factIds.length
  )
    throw new FleetError("DECISION_EVIDENCE_SHAPE", true);
  if (decision.bindingId !== e.bindingId) throw new FleetError("DECISION_BINDING_MISMATCH", true);
  if (decision.revision !== e.revision) throw new FleetError("DECISION_REVISION_MISMATCH", true);
  if (typeof decision.choiceId !== "string" || !e.choices.includes(decision.choiceId))
    throw new FleetError("DECISION_CHOICE_UNAVAILABLE", true);
  if (!permittedChoices(e).includes(decision.choiceId)) throw new FleetError("DECISION_OBJECTIVE_VIOLATION", true);
  const factIds = decision.factIds as string[];
  if (factIds.some((id) => !e.facts.some((f) => f.id === id))) throw new FleetError("DECISION_FACT_UNAVAILABLE", true);
  if (e.requiredFacts.some((id) => !factIds.includes(id))) throw new FleetError("DECISION_FACT_REQUIRED", true);
  const facts = factIds.map((id) => e.facts.find((f) => f.id === id));
  return {
    bindingId: e.bindingId,
    revision: e.revision,
    choiceId: decision.choiceId,
    facts,
    summary: `Observed evidence: ${JSON.stringify(facts)}`,
  };
}
export type VerifiedEvidenceDecision = ReturnType<typeof validateEvidenceDecision>;
