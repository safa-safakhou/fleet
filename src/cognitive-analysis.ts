import { z } from "zod";
import {
  beliefCue,
  type CognitiveState,
  CognitiveUpdate,
  type Episode,
  gameTime,
  groundReflection,
  isNewPeerEvidence,
  isWorldResult,
  testedReply,
  type Update,
  utf8Prefix,
} from "./cognition.js";
import { type Data, Decision, FleetError, object } from "./domain.js";

type Opportunity = {
  key: string;
  type: "belief" | "reflection" | "reassessment";
  sourceId: string;
  peerId?: string;
  basisKind?: string;
  expected?: string;
  observed?: string;
  statement?: string;
};
// Recompute from the final delivered evidence. An alias is never an additional
// fact, permission, or a way to cite an evicted source.
export function analysisOpportunities(delivered: Data): Opportunity[] {
  const evidence = (Array.isArray(delivered.evidence) ? delivered.evidence : []).map((e) => e as Episode);
  const peers = new Set(Array.isArray(delivered.knownPeerIds) ? delivered.knownPeerIds : []);
  const reflected = new Set(Array.isArray(delivered.reflectedOutcomeIds) ? delivered.reflectedOutcomeIds : []);
  const state: CognitiveState = {
    plan: null,
    beliefs: Array.isArray(delivered.beliefs) ? (delivered.beliefs as CognitiveState["beliefs"]) : [],
    reflections: [],
  };
  const reviewed = object(delivered.reviewedPeerEvidenceAt);
  const newPeerEvidence = (source: Episode, peerId: string) =>
    isNewPeerEvidence(source, state.beliefs, peerId) &&
    (typeof reviewed[peerId] !== "number" ||
      (source.kind === "message" && Date.parse(source.at) > Number(reviewed[peerId])));
  const result: Opportunity[] = [];
  const incoming = evidence.find(
    (e) =>
      e.kind === "message" &&
      object(e.detail).direction === "incoming" &&
      peers.has(object(e.detail).peerId) &&
      newPeerEvidence(e, String(object(e.detail).peerId)),
  );
  const observation = evidence.find(
    (e) =>
      e.kind === "observation" &&
      Array.isArray(object(e.detail).peerFacts) &&
      (object(e.detail).peerFacts as unknown[]).some(
        (f) =>
          peers.has(object(f).peerId) &&
          ["contact", "agreement"].includes(String(object(f).kind)) &&
          newPeerEvidence(e, String(object(f).peerId)),
      ),
  );
  const basis = incoming ?? observation;
  const current = evidence.find((e) => e.id === delivered.currentEvidenceId);
  if (
    basis &&
    beliefCue(basis, incoming ? "statement" : "contact").trim().length >= 8 &&
    current &&
    gameTime(current) !== undefined &&
    !state.beliefs.some((b) => b.basis?.sourceId === basis.id && b.evidenceQuote)
  ) {
    const fact = incoming
      ? object(incoming.detail)
      : (object(observation?.detail).peerFacts as unknown[])
          .map(object)
          .find(
            (f) =>
              peers.has(f.peerId) &&
              ["contact", "agreement"].includes(String(f.kind)) &&
              newPeerEvidence(basis, String(f.peerId)),
          );
    if (!fact) throw new FleetError("COGNITION_ANALYSIS_NOT_OFFERED");
    result.push({
      key: "peer_evidence",
      type: "belief",
      sourceId: basis.id,
      peerId: String(fact.peerId),
      basisKind: incoming ? "statement" : String(fact.kind),
      statement: beliefCue(basis, incoming ? "statement" : String(fact.kind)).slice(0, 180),
    });
  }
  const reply = evidence.find(
    (e) =>
      testedReply(e, state.beliefs) &&
      !state.beliefs.some((b) => b.assessment === "supported" && b.basis?.sourceId === e.id),
  );
  if (reply) {
    const prior = testedReply(reply, state.beliefs);
    if (prior)
      result.push({
        key: "tested_prediction",
        type: "reassessment",
        sourceId: reply.id,
        peerId: prior.peerId,
        basisKind: "reply",
        statement: beliefCue(reply, "reply").slice(0, 180),
        expected: prior.prediction,
        observed:
          "Incoming statement within the saved reply window; content is peer claim, not verified delivery/agreement.",
      });
  }
  for (const source of evidence) {
    if (reflected.has(source.id) || !isWorldResult(source)) continue;
    try {
      const grounded = groundReflection(
        { outcomeRef: source.id, revision: "Eligible recorded outcome", evidenceRefs: [source.id] },
        [source],
        state,
        delivered,
      );
      result.push({
        key: "recorded_result",
        type: "reflection",
        sourceId: source.id,
        expected: grounded.expected,
        observed: grounded.observed,
      });
      break;
    } catch {
      /* Not a verified result/previously tested prediction. */
    }
  }
  return result;
}
const prose = z.string().trim().min(20).max(180);
const None = z.object({ type: z.literal("none"), reason: z.string().trim().min(1).max(180) }).strict();
const Belief = z
  .object({
    type: z.literal("belief"),
    opportunity: z.literal("peer_evidence"),
    inferredMotive: prose,
    alternativeMotive: prose,
    evidenceQuote: z.string().trim().min(8).max(120),
    expectedPeerResponse: z.string().trim().min(15).max(120),
    confidence: z.enum(["low", "medium"]),
    predictedEvent: z.enum(["reply", "agreement"]),
    reviewAfterMinutes: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(120),
      z.literal(360),
      z.literal(1440),
    ]),
  })
  .strict();
const Reflection = z
  .object({
    type: z.literal("reflection"),
    opportunity: z.literal("recorded_result"),
    observedFact: z.string().min(1).max(300),
    difference: z.string().trim().min(20).max(100),
    lesson: z.string().trim().min(20).max(100),
    nextStep: z.string().trim().min(15).max(75),
  })
  .strict();
const Reassessment = z
  .object({
    type: z.literal("reassessment"),
    opportunity: z.literal("tested_prediction"),
    evidenceQuote: z.string().trim().min(8).max(120),
    inferredMotive: prose,
    alternativeMotive: prose,
    confidence: z.enum(["low", "medium"]),
    assessment: z.enum(["supported", "unresolved"]),
  })
  .strict();
const NativeUpdate = CognitiveUpdate.omit({ review: true, beliefs: true, reflections: true })
  .extend({ analysis: z.union([None, Belief, Reflection, Reassessment]) })
  .strict();

export const analysisDecisionGuide = {
  decision:
    "Return {cognition,decision} in that order. decision is one wait/read/action with summary; action arguments directly in decision.action.",
  cognition:
    "expectedVersion=cognition.version; analysis required. Use one offered key: belief {type,opportunity,evidenceQuote,inferredMotive,alternativeMotive,expectedPeerResponse,confidence:low|medium,predictedEvent:reply|agreement,reviewAfterMinutes:15|30|60|120|360|1440}; reflection {type,opportunity,observedFact,difference,lesson,nextStep}; reassessment {type,opportunity,evidenceQuote,inferredMotive,alternativeMotive,confidence:low|medium,assessment:supported|unresolved}; or none {type,reason}. Fleet supplies IDs/time/verified result. Optional plan {goal,steps,status,reconsiderWhen,evidenceRefs}, memories [{summary,importance,evidenceRefs}]; omit unchanged fields.",
};
export const analysisInstructions =
  "Cognition first: inspect sources/analysisOpportunities; quote exact text/result. Cautious peer motive + alternative; predict reply/agreement, not builder benefit/confidence. Greeting!=commitment. Compare intent/result: difference, lesson, next step. Not submitted=no action; commit!=completion; repeated intent!=reflection. Reply tests responsiveness, not reliability. No new insight: none; keep useful plans.";

export function analysisSchemaForVersion(
  version: unknown,
  delivered: Data,
  edits: { plan?: boolean; memories?: boolean } = {},
): Data {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
    throw new FleetError("COGNITION_VERSION_REQUIRED");
  const opportunities = analysisOpportunities(delivered);
  const choices: [z.ZodType, ...z.ZodType[]] = [None];
  const peer = opportunities.find((o) => o.type === "belief");
  if (peer) choices.push(Belief.extend({ evidenceQuote: z.literal(utf8Prefix(peer.statement ?? "", 120)) }));
  const result = opportunities.find((o) => o.type === "reflection");
  if (result) choices.push(Reflection.extend({ observedFact: z.literal(result.observed) }));
  const reply = opportunities.find((o) => o.type === "reassessment");
  if (reply) choices.push(Reassessment.extend({ evidenceQuote: z.literal(utf8Prefix(reply.statement ?? "", 120)) }));
  const update = NativeUpdate.extend({ expectedVersion: z.literal(version), analysis: z.union(choices) });
  const schema = z.toJSONSchema(z.object({ cognition: update, decision: Decision }).strict(), {
    target: "draft-7",
    reused: "ref",
  });
  const ids = (Array.isArray(delivered.evidence) ? delivered.evidence.map(object) : [])
    .filter((e) => e.kind !== "interpretation" && z.uuid().safeParse(e.id).success)
    .map((e) => e.id);
  const constrain = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (object(v).format === "uuid") {
      if (ids.length) object(v).enum = ids;
      else object(v).not = {}; // No evidence means citations are impossible, not an invalid empty enum.
      delete object(v).format;
      delete object(v).pattern;
    }
    if (!ids.length && object(object(v).properties).expectedVersion) {
      object(object(v).properties).plan = { type: "null" };
      object(object(object(v).properties).memories).maxItems = 0;
    }
    for (const child of Object.values(v)) constrain(child);
  };
  constrain(schema);
  const properties = object(object(object(schema.properties).cognition).properties);
  for (const field of ["plan", "memories"] as const) if (edits[field] === false) delete properties[field];
  return schema;
}

export function normalizeAnalysis(raw: unknown, delivered: Data): unknown {
  if (!Object.hasOwn(object(raw), "analysis")) return raw; // Existing canonical clients/journals remain compatible.
  const parsed = NativeUpdate.safeParse(raw);
  if (!parsed.success) throw new FleetError("COGNITION_INVALID_ANALYSIS");
  const { analysis, ...fields } = parsed.data;
  const review: NonNullable<Update["review"]> = {
    beliefs: "unchanged",
    reflection: "unchanged",
    reason:
      analysis.type === "none"
        ? analysis.reason
        : "Source-linked analysis proposed; acceptance is recorded separately.",
  };
  const update: Update = {
    ...fields,
    review,
  };
  if (analysis.type === "none") return update;
  const opportunity = analysisOpportunities(delivered).find(
    (o) => o.key === analysis.opportunity && o.type === analysis.type,
  );
  if (!opportunity) throw new FleetError("COGNITION_ANALYSIS_NOT_OFFERED");
  if (analysis.type === "reflection") {
    if (analysis.observedFact !== opportunity.observed) throw new FleetError("COGNITION_OUTCOME_MISMATCH");
    update.reflections = [
      {
        outcomeRef: opportunity.sourceId,
        observed: analysis.observedFact,
        revision: `${analysis.difference} So: ${analysis.lesson} Next: ${analysis.nextStep}`,
        evidenceRefs: [opportunity.sourceId],
      },
    ];
    review.reflection = "updated";
  } else if (analysis.type === "reassessment") {
    const source = (delivered.evidence as Episode[]).find((e) => e.id === opportunity.sourceId);
    const prior = source && testedReply(source, delivered.beliefs as CognitiveState["beliefs"]);
    if (!prior) throw new FleetError("COGNITION_ANALYSIS_NOT_OFFERED");
    const { updatedAt: _date, predictionRecordedAt: _predictionDate, ...belief } = prior;
    update.beliefs = [
      {
        ...belief,
        evidenceQuote: analysis.evidenceQuote,
        hypothesis: analysis.inferredMotive,
        alternative: analysis.alternativeMotive,
        confidence: analysis.confidence,
        assessment: analysis.assessment,
        basis: { sourceId: opportunity.sourceId, kind: "reply" },
        evidenceRefs: [opportunity.sourceId],
      },
    ];
    review.beliefs = "updated";
  } else {
    const current = (delivered.evidence as Episode[]).find((e) => e.id === delivered.currentEvidenceId);
    const after =
      current && gameTime(current) !== undefined
        ? (delivered.evidence as Episode[]).reduce(
            (latest, e) => Math.max(latest, gameTime(e) ?? 0),
            gameTime(current) ?? 0,
          )
        : undefined;
    if (after === undefined || !opportunity.peerId) throw new FleetError("COGNITION_ANALYSIS_NOT_OFFERED");
    update.beliefs = [
      {
        peerId: opportunity.peerId,
        hypothesis: analysis.inferredMotive,
        alternative: analysis.alternativeMotive,
        prediction: `Expect ${analysis.predictedEvent} within ${analysis.reviewAfterMinutes} game minutes: ${analysis.expectedPeerResponse}`,
        evidenceQuote: analysis.evidenceQuote,
        confidence: analysis.confidence,
        assessment: "untested",
        basis: { sourceId: opportunity.sourceId, kind: opportunity.basisKind as "statement" | "contact" | "agreement" },
        test: {
          kind: analysis.predictedEvent,
          afterGameTimeMs: after,
          byGameTimeMs: after + analysis.reviewAfterMinutes * 60000,
        },
        evidenceRefs: [opportunity.sourceId],
      },
    ];
    review.beliefs = "updated";
  }
  return update;
}
