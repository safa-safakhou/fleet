import { z } from "zod";
import {
  beliefCue,
  type CognitiveState,
  CognitiveUpdate,
  type Episode,
  gameTime,
  groundReflection,
  testedReply,
  type Update,
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
  const result: Opportunity[] = [];
  const incoming = evidence.find(
    (e) => e.kind === "message" && object(e.detail).direction === "incoming" && peers.has(object(e.detail).peerId),
  );
  const observation = evidence.find(
    (e) =>
      e.kind === "observation" &&
      Array.isArray(object(e.detail).peerFacts) &&
      (object(e.detail).peerFacts as unknown[]).some(
        (f) => peers.has(object(f).peerId) && ["contact", "agreement"].includes(String(object(f).kind)),
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
          .find((f) => peers.has(f.peerId) && ["contact", "agreement"].includes(String(f.kind)));
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
        expected: prior.prediction,
        observed:
          "Incoming statement within the saved reply window; content is peer claim, not verified delivery/agreement.",
      });
  }
  for (const source of evidence) {
    if (reflected.has(source.id)) continue;
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
    hypothesis: prose,
    alternative: prose,
    evidenceQuote: z.string().trim().min(8).max(120),
    expectedInteraction: z.string().trim().min(15).max(120),
    confidence: z.enum(["low", "medium"]),
    predictedEvent: z.enum(["reply", "agreement"]),
    reviewAfterMinutes: z.number().int().min(15).max(1440),
  })
  .strict();
const Reflection = z
  .object({
    type: z.literal("reflection"),
    opportunity: z.literal("recorded_result"),
    difference: z.string().trim().min(20).max(100),
    lesson: z.string().trim().min(20).max(100),
    nextStep: z.string().trim().min(15).max(75),
  })
  .strict();
const Reassessment = z
  .object({
    type: z.literal("reassessment"),
    opportunity: z.literal("tested_prediction"),
    hypothesis: prose,
    alternative: prose,
    confidence: z.enum(["low", "medium"]),
    assessment: z.enum(["supported", "unresolved"]),
  })
  .strict();
const NativeUpdate = CognitiveUpdate.omit({ review: true, beliefs: true, reflections: true })
  .extend({ analysis: z.union([None, Belief, Reflection, Reassessment]) })
  .strict();

export const analysisDecisionGuide = {
  decision: "One wait/read/action with summary and cognition. Action arguments directly in action.",
  cognition:
    "expectedVersion=cognition.version; analysis required. Use one offered key: belief {type,opportunity,evidenceQuote,hypothesis,alternative,expectedInteraction,confidence:low|medium,predictedEvent:reply|agreement,reviewAfterMinutes:15..1440}; reflection {type,opportunity,difference,lesson,nextStep}; reassessment {type,opportunity,hypothesis,alternative,confidence:low|medium,assessment:supported|unresolved}; or none {type,reason}. Fleet supplies IDs/time/verified result. Optional plan {goal,steps,status,reconsiderWhen,evidenceRefs}, memories [{summary,importance,evidenceRefs}]; omit unchanged fields.",
};
export const analysisInstructions =
  "Use offered analysisOpportunities only. Peer: copy exact evidenceQuote from statement. Give a cautious motive hypothesis and competing explanation. expectedInteraction is specific future reply/agreement content, not confidence metadata or your upgrade. A greeting does not establish an ally or building commitment. Result: difference compares recorded intention and observed result; lesson explains its consequence; nextStep follows. Example: 'already linked' confirms a link, not cooperation; another request won't test interest; read the exchange and ask a concrete question. Explain this result, not an unrelated recalled action. Prior hypotheses may be wrong. For tested_prediction, a reply tests responsiveness, not reliability. Choose none when no new insight: repeating an intention is not reflection. Keep useful plans. No hidden reasoning.";

export function analysisSchemaForVersion(version: unknown, delivered: Data): Data {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
    throw new FleetError("COGNITION_VERSION_REQUIRED");
  const opportunities = analysisOpportunities(delivered);
  const choices: [typeof None, ...(typeof Belief | typeof Reflection | typeof Reassessment)[]] = [None];
  if (opportunities.some((o) => o.type === "belief")) choices.push(Belief);
  if (opportunities.some((o) => o.type === "reflection")) choices.push(Reflection);
  if (opportunities.some((o) => o.type === "reassessment")) choices.push(Reassessment);
  const update = NativeUpdate.extend({ expectedVersion: z.literal(version), analysis: z.union(choices) });
  const schema = z.toJSONSchema(z.union(Decision.options.map((d) => d.extend({ cognition: update }))), {
    target: "draft-7",
    reused: "ref",
  });
  const ids = (Array.isArray(delivered.evidence) ? delivered.evidence.map(object) : [])
    .filter((e) => e.kind !== "interpretation" && z.uuid().safeParse(e.id).success)
    .map((e) => e.id);
  const constrain = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (object(v).format === "uuid") {
      object(v).enum = ids;
      delete object(v).pattern;
    }
    if (!ids.length && object(object(v).properties).expectedVersion) {
      object(object(v).properties).plan = { type: "null" };
      object(object(object(v).properties).memories).maxItems = 0;
    }
    for (const child of Object.values(v)) constrain(child);
  };
  constrain(schema);
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
    update.reflections = [
      {
        outcomeRef: opportunity.sourceId,
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
        hypothesis: analysis.hypothesis,
        alternative: analysis.alternative,
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
        hypothesis: analysis.hypothesis,
        alternative: analysis.alternative,
        prediction: `Expect ${analysis.predictedEvent} within ${analysis.reviewAfterMinutes} game minutes: ${analysis.expectedInteraction}`,
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
