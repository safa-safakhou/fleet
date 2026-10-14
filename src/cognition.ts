import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "./db.js";
import { type Data, Decision, FleetError, object } from "./domain.js";
import { Observability, scrub } from "./observability.js";
import type { Claim, Store } from "./store.js";

const text = z.string().trim().min(1).max(300),
  refs = z.array(z.uuid()).min(1).max(4);
const Plan = z
  .object({
    goal: text,
    steps: z.array(z.string().min(1).max(100)).min(1).max(3),
    status: z.enum(["active", "waiting", "complete", "abandoned"]),
    reconsiderWhen: text,
    evidenceRefs: refs,
  })
  .strict();
const Test = z
  .object({
    kind: z.enum(["reply", "agreement"]),
    afterGameTimeMs: z.number().int().nonnegative(),
    byGameTimeMs: z.number().int().nonnegative(),
  })
  .strict();
const Basis = z
  .object({
    sourceId: z.uuid(),
    kind: z.enum(["statement", "reply", "contact", "agreement"]),
  })
  .strict();
const Belief = z
  .object({
    peerId: z.string().min(1).max(100),
    hypothesis: text,
    alternative: text,
    confidence: z.enum(["low", "medium", "high"]),
    prediction: text,
    evidenceQuote: z.string().trim().min(8).max(120).optional(),
    basis: Basis.optional(),
    test: Test.optional(),
    assessment: z.enum(["untested", "supported", "contradicted", "unresolved"]),
    evidenceRefs: refs,
  })
  .strict();
const Reflection = z
  .object({
    outcomeRef: z.uuid().optional(),
    expected: text.optional(),
    observed: text.optional(),
    revision: text,
    evidenceRefs: refs,
  })
  .strict();
const Review = z
  .object({
    beliefs: z.enum(["updated", "unchanged", "insufficient_evidence"]),
    reflection: z.enum(["updated", "unchanged", "insufficient_evidence"]),
    reason: z.string().trim().min(1).max(200),
  })
  .strict();
export const CognitiveUpdate = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    review: Review.optional(),
    plan: Plan.nullable().optional(),
    beliefs: z.array(Belief).max(3).optional(),
    reflections: z.array(Reflection).max(2).optional(),
    memories: z
      .array(z.object({ summary: text, importance: z.number().int().min(1).max(5), evidenceRefs: refs }).strict())
      .max(2)
      .optional(),
  })
  .strict();
export const CognitiveDecision = z.discriminatedUnion("kind", [
  Decision.options[0].extend({ cognition: CognitiveUpdate.optional() }),
  Decision.options[1].extend({ cognition: CognitiveUpdate.optional() }),
  Decision.options[2].extend({ cognition: CognitiveUpdate.optional() }),
]);
export const cognitiveDecisionSchema = z.toJSONSchema(CognitiveDecision, { target: "draft-7", reused: "ref" });
export function cognitiveSchemaForVersion(version: unknown, delivered?: Data): Data {
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
    throw new FleetError("COGNITION_VERSION_REQUIRED");
  const schema = structuredClone(cognitiveDecisionSchema);
  const evidenceIds = delivered
    ? [
        ...new Set(
          (Array.isArray(delivered.evidence) ? delivered.evidence.map(object) : [])
            .filter((episode) => episode.kind !== "interpretation" && z.uuid().safeParse(episode.id).success)
            .map((episode) => String(episode.id)),
        ),
      ]
    : [];
  const peerIds = delivered
    ? [
        ...new Set(
          (Array.isArray(delivered.knownPeerIds) ? delivered.knownPeerIds : []).filter(
            (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 100,
          ),
        ),
      ]
    : [];
  const deliveredEvidence = delivered && Array.isArray(delivered.evidence) ? delivered.evidence.map(object) : [];
  const basisIds = deliveredEvidence
    .filter((e) => {
      const d = object(e.detail);
      return (
        (e.kind === "message" && d.direction === "incoming" && typeof d.peerId === "string") ||
        (e.kind === "observation" && Array.isArray(d.peerFacts) && d.peerFacts.length > 0)
      );
    })
    .map((e) => String(e.id));
  const outcomeIds = deliveredEvidence
    .filter(
      (e) =>
        (e.kind === "receipt" && typeof object(e.detail).intent === "string") ||
        (e.kind === "message" &&
          !!testedReply(
            e as Episode,
            Array.isArray(delivered?.beliefs) ? (delivered.beliefs as CognitiveState["beliefs"]) : [],
          )),
    )
    .map((e) => String(e.id));
  const constrain = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const properties = object(object(value).properties);
    if (properties.expectedVersion) {
      object(properties.expectedVersion).const = version;
      object(value).required = [...new Set([...((object(value).required as string[]) ?? []), "review"])];
    }
    if (properties.prediction) {
      object(value).required = [...new Set([...((object(value).required as string[]) ?? []), "basis", "test"])];
      object(properties.confidence).enum = ["low", "medium"];
      object(properties.assessment).enum = ["untested", "supported", "unresolved"];
      object(properties.prediction).minLength = 20;
    }
    if (properties.revision) {
      object(value).required = [...new Set([...((object(value).required as string[]) ?? []), "outcomeRef"])];
      delete properties.expected;
      delete properties.observed;
      object(properties.revision).minLength = 20;
    }
    if (properties.cognition)
      object(value).required = [...new Set([...((object(value).required as string[]) ?? []), "cognition"])];
    if (delivered) {
      if (object(value).format === "uuid" && evidenceIds.length) {
        object(value).enum = Array.isArray(object(value).enum)
          ? (object(value).enum as unknown[]).filter((id) => evidenceIds.includes(String(id)))
          : evidenceIds;
        delete object(value).pattern;
      }
      if (properties.sourceId && properties.kind && basisIds.length) object(properties.sourceId).enum = basisIds;
      if (properties.outcomeRef && outcomeIds.length) object(properties.outcomeRef).enum = outcomeIds;
      if (properties.reflections && !outcomeIds.length) object(properties.reflections).maxItems = 0;
      if (properties.beliefs && !basisIds.length) object(properties.beliefs).maxItems = 0;
      if (properties.peerId && peerIds.length) object(properties.peerId).enum = peerIds;
      if (object(properties.beliefs).type === "array" && (!peerIds.length || !evidenceIds.length))
        object(properties.beliefs).maxItems = 0;
      if (properties.expectedVersion && !evidenceIds.length) {
        properties.plan = { type: "null" };
        for (const key of ["beliefs", "reflections", "memories"]) object(properties[key]).maxItems = 0;
      }
    }
    for (const child of Object.values(value)) constrain(child);
  };
  constrain(schema);
  return schema;
}
// The provider enforces the complete schema. Avoid duplicating its expanded
// definitions in the user prompt, while spelling out every optional update field.
export const cognitiveDecisionGuide = {
  decision:
    "One JSON wait/read/action with summary and cognition; exact provider schema applies. Action fields go directly inside action.",
  cognition: {
    expectedVersion: "copy cognition.version",
    review: "required {beliefs,reflection:updated|unchanged|insufficient_evidence,reason}",
    plan: "optional {goal,steps,status,reconsiderWhen,evidenceRefs}; null clears",
    beliefs:
      "optional [{peerId,hypothesis,alternative,confidence,prediction,assessment,basis:{sourceId,kind},test:{kind:reply|agreement,afterGameTimeMs,byGameTimeMs},evidenceRefs}]",
    reflections: "optional [{outcomeRef,revision,evidenceRefs}]; recorded intent/result supplied by Fleet",
    memories: "optional [{summary,importance,evidenceRefs}]",
    constraints:
      "Omit unchanged fields. Cite delivered IDs. Observe peers/direction. A review needs no invented lesson.",
  },
};
export function deliveredCognition(context: Data): Data {
  const current = object(context.cognition),
    read = object(context.requestedRead);
  if (read.tool !== "fleet_memory_recall") return current;
  const recalled = object(read.result);
  return {
    ...current,
    evidence: [
      ...(Array.isArray(current.evidence) ? current.evidence : []),
      ...(Array.isArray(recalled.evidence) ? recalled.evidence : []),
    ],
    knownPeerIds: [
      ...(Array.isArray(current.knownPeerIds) ? current.knownPeerIds : []),
      ...(Array.isArray(recalled.knownPeerIds) ? recalled.knownPeerIds : []),
    ],
    reflectedOutcomeIds: [
      ...(Array.isArray(current.reflectedOutcomeIds) ? current.reflectedOutcomeIds : []),
      ...(Array.isArray(recalled.reflectedOutcomeIds) ? recalled.reflectedOutcomeIds : []),
    ],
  };
}
export type Update = z.infer<typeof CognitiveUpdate>;
type Dated<T> = T & { updatedAt: string };
export type CognitiveState = {
  plan: Dated<z.infer<typeof Plan>> | null;
  beliefs: (Dated<z.infer<typeof Belief>> & { predictionRecordedAt?: string })[];
  reflections: (Dated<z.infer<typeof Reflection>> & {
    expected: string;
    observed: string;
    reviewProtocol?: "observed-first";
  })[];
};
export type Episode = { id: string; at: string; kind: string; detail: Data };
export function episodeText(episode: Episode) {
  const detail = episode.detail,
    body = object(detail.body);
  if (episode.kind === "receipt" && (detail.intent || object(detail.receipt).code || detail.code))
    return `Recorded intent: ${String(detail.intent ?? "not recorded")}; action: ${String(object(detail.action).kind ?? detail.actionKind ?? "unknown")}; receipt: ${String(object(detail.receipt).code ?? detail.code ?? "unknown")}; committed: ${String(detail.committed ?? "unknown")}.`;
  const prose =
    detail.summary ??
    (typeof detail.body === "string" ? detail.body : (body.body ?? body.text)) ??
    detail.text ??
    detail.excerpt;
  const statement = typeof prose === "string" ? prose : JSON.stringify(detail);
  return episode.kind === "message"
    ? `${detail.direction === "incoming" ? "Incoming peer statement" : detail.direction === "outgoing" ? "Outgoing self message" : "Unknown message direction"}; peer ${String(detail.peerId ?? "unknown")}: ${statement}`
    : statement;
}
export function beliefCue(episode: Episode, kind: string) {
  if (kind === "contact" || kind === "agreement") return `Observed ${kind} record; motives and reliability unknown.`;
  const d = episode.detail,
    body = object(d.body);
  const prose = typeof d.body === "string" ? d.body : (body.body ?? body.text ?? d.text ?? d.summary ?? d.excerpt);
  const value = typeof prose === "string" ? prose : "";
  const prefix = `Incoming peer statement; peer ${String(d.peerId ?? "unknown")}: `;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
export function isWorldResult(episode: Episode) {
  const code = String(object(episode.detail.receipt).code ?? episode.detail.code);
  if (["INVALID_COMMAND", "INVALID_GAME_ACTION", "OBSERVED_MANDATE_VERSION_MISMATCH"].includes(code)) return false;
  return (
    episode.kind === "message" ||
    (episode.kind === "receipt" && ["receipt", "explicit_rejection"].includes(String(episode.detail.source)))
  );
}
// Put the actual statement/outcome before incidental serialized metadata. Keep
// source identity and uncertainty when a large historical record is excerpted.
export function compactEpisode(episode: Episode, limit = 600): Data {
  const detail = episode.detail;
  if (Buffer.byteLength(JSON.stringify(detail)) <= limit) return detail;
  const result: Data = Object.fromEntries(
    [
      "peerId",
      "direction",
      "gameTime",
      "asOfGameTimeMs",
      "commandId",
      "committed",
      "source",
      "submitted",
      "actionKind",
      "code",
      "intent",
    ]
      .filter(
        (key) =>
          typeof detail[key] === "string" || typeof detail[key] === "boolean" || Number.isSafeInteger(detail[key]),
      )
      .map((key) => [key, detail[key]]),
  );
  if (episode.kind === "receipt") {
    result.actionKind = object(detail.action).kind ?? detail.actionKind;
    result.code = object(detail.receipt).code ?? detail.code;
    result.intent = typeof detail.intent === "string" ? utf8Prefix(detail.intent, 200) : undefined;
  }
  if (Array.isArray(detail.peerFacts)) result.peerFacts = detail.peerFacts.slice(0, 3);
  result.coverage = "Partial dated evidence; omitted details are unknown. Re-read before relying on them.";
  result.excerpt = "";
  let remaining = Math.max(0, limit - Buffer.byteLength(JSON.stringify(result)));
  // The excerpt itself is a JSON string: quotes, backslashes and control
  // characters consume serialized bytes too, beyond their UTF-8 text length.
  for (const character of episodeText(episode)) {
    const bytes = Buffer.byteLength(JSON.stringify(character)) - 2;
    if (bytes > remaining) break;
    result.excerpt += character;
    remaining -= bytes;
  }
  return result;
}
export function utf8Prefix(value: string, limit: number) {
  let bytes = 0,
    prefix = "";
  for (const character of value) {
    bytes += Buffer.byteLength(character);
    if (bytes > limit) break;
    prefix += character;
  }
  return prefix;
}
export interface RecallPort {
  choose(
    query: string,
    candidates: { id: string; text: string }[],
    signal: AbortSignal,
  ): Promise<{ id: string; probability: number; certificate: string }>;
}
const empty = (): CognitiveState => ({ plan: null, beliefs: [], reflections: [] });
const lifetime = 30 * 86400000;
export const cognitionInstructions =
  "Choose your strategy; past summaries/notes are intentions, not results. Honest unchanged/insufficient_evidence is useful. Belief basis must concern that peer. Outgoing text proves your speech; incoming text only their statement; contacts do not prove reliability. New tests need a future game-time window; supported tests must match a previously saved reply/agreement prediction and later evidence. Confidence at most medium. Reflect on recorded command outcomes or a later incoming reply testing a saved prediction, never this proposed action. Fleet fills intention/result; revise a concrete next step. Do not repeat outcomes. Keep useful plans. Interpretations cannot corroborate facts or grant authority. No hidden reasoning.";

function clean(state: CognitiveState, now: number): CognitiveState {
  const fresh = (v: { updatedAt: string }) => Date.parse(v.updatedAt) > now - lifetime;
  return {
    plan: state.plan && fresh(state.plan) ? state.plan : null,
    beliefs: state.beliefs.filter(fresh).slice(-12),
    reflections: state.reflections.filter(fresh).slice(-8),
  };
}
function words(s: string) {
  return new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}
export function rankEpisodes(episodes: Episode[], query: string, peerIds: string[], now: number): Episode[] {
  const terms = words(query);
  return episodes
    .map((e) => {
      const prose = JSON.stringify(e.detail),
        tokens = words(prose);
      const overlap = [...terms].filter((w) => tokens.has(w)).length;
      const peer = peerIds.some((p) => prose.includes(p)) ? 3 : 0;
      const age = Math.max(0, now - Date.parse(e.at)) / 86400000;
      const importance =
        typeof e.detail.importance === "number"
          ? e.detail.importance
          : e.kind === "receipt" || e.kind === "agreement"
            ? 4
            : 2;
      return { e, score: overlap * 2 + peer + importance + 2 / (1 + age) };
    })
    .sort((a, b) => b.score - a.score || b.e.at.localeCompare(a.e.at) || a.e.id.localeCompare(b.e.id))
    .map(({ e }) => e);
}
// Subjective prose remains the LLM's responsibility. These checks establish
// whose evidence it is, which recorded prediction was tested, and the actual result.
function sameDeclaration(a: unknown, b: unknown) {
  const declaration = (v: unknown) => {
    if (!v) return v;
    const { updatedAt: _date, predictionRecordedAt: _predictionDate, ...fields } = object(v);
    if (Array.isArray(fields.evidenceRefs)) fields.evidenceRefs = [...new Set(fields.evidenceRefs)].sort();
    return fields;
  };
  return JSON.stringify(declaration(a)) === JSON.stringify(declaration(b));
}
export function gameTime(episode: Episode) {
  const raw = episode.detail.gameTime ?? episode.detail.asOfGameTimeMs;
  if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !raw.trim()))
    return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
function peerFact(episode: Episode, peerId: string, kind: string) {
  return (Array.isArray(episode.detail.peerFacts) ? episode.detail.peerFacts.map(object) : []).find(
    (fact) => fact.peerId === peerId && fact.kind === kind,
  );
}
function validateBeliefs(
  beliefs: NonNullable<Update["beliefs"]>,
  state: CognitiveState,
  sources: Episode[],
  currentTime?: number,
  visibleSources: Data[] = [],
) {
  for (const belief of beliefs) {
    const basis = belief.basis,
      test = belief.test;
    if (!basis || !test || !belief.evidenceRefs.includes(basis.sourceId))
      throw new FleetError("COGNITION_BELIEF_BASIS_REQUIRED");
    const source = sources.find((e) => e.id === basis.sourceId);
    if (!source) throw new FleetError("COGNITION_BELIEF_BASIS_REQUIRED");
    const incoming =
      source.kind === "message" && source.detail.direction === "incoming" && source.detail.peerId === belief.peerId;
    const scoped = ["statement", "reply"].includes(basis.kind)
      ? incoming
      : source.kind === "observation" && !!peerFact(source, belief.peerId, basis.kind);
    const visible = object(visibleSources.find((e) => e.id === basis.sourceId)?.detail);
    const visibleScoped = ["statement", "reply"].includes(basis.kind)
      ? visible.direction === "incoming" && visible.peerId === belief.peerId
      : (Array.isArray(visible.peerFacts) ? visible.peerFacts.map(object) : []).some(
          (fact) => fact.peerId === belief.peerId && fact.kind === basis.kind,
        );
    if (!scoped || !visibleScoped) throw new FleetError("COGNITION_PEER_EVIDENCE_MISMATCH");
    if (
      belief.evidenceQuote &&
      (!beliefCue(source, basis.kind).includes(belief.evidenceQuote) ||
        !beliefCue({ ...source, detail: visible }, basis.kind).includes(belief.evidenceQuote))
    )
      throw new FleetError("COGNITION_QUOTE_NOT_OBSERVED");
    if (belief.confidence === "high") throw new FleetError("COGNITION_CONFIDENCE_UNSUPPORTED");
    if (belief.prediction.length < 20 || belief.hypothesis.toLowerCase() === belief.alternative.toLowerCase())
      throw new FleetError("COGNITION_TEST_NOT_SPECIFIC");
    if (test.byGameTimeMs <= test.afterGameTimeMs || test.byGameTimeMs - test.afterGameTimeMs > lifetime)
      throw new FleetError("COGNITION_TEST_WINDOW_INVALID");
    const prior = state.beliefs.find((b) => b.peerId === belief.peerId && b.basis && b.test);
    const sameTest =
      prior && prior.prediction === belief.prediction && JSON.stringify(prior.test) === JSON.stringify(test);
    if (!sameTest && currentTime !== undefined && test.afterGameTimeMs < currentTime)
      throw new FleetError("COGNITION_RETROACTIVE_PREDICTION");
    if (["supported", "contradicted"].includes(belief.assessment)) {
      const eventAt =
        basis.kind === "agreement"
          ? Number(peerFact(source, belief.peerId, "agreement")?.eventGameTimeMs)
          : gameTime(source);
      const at = Number.isSafeInteger(eventAt) && Number(eventAt) >= 0 ? eventAt : undefined;
      // A reply tests responsiveness, never agreement or successful delivery.
      // Missing replies have incomplete coverage and cannot prove contradiction.
      if (
        belief.assessment === "contradicted" ||
        !sameTest ||
        !prior ||
        Date.parse(source.at) <= Date.parse(prior.predictionRecordedAt ?? prior.updatedAt) ||
        basis.kind !== test.kind ||
        at === undefined ||
        at <= test.afterGameTimeMs ||
        at > test.byGameTimeMs
      )
        throw new FleetError("COGNITION_TEST_OUTCOME_UNVERIFIED");
    }
  }
}
export function testedReply(source: Episode, beliefs: CognitiveState["beliefs"]) {
  const at = gameTime(source);
  if (source.kind !== "message" || source.detail.direction !== "incoming" || at === undefined) return undefined;
  return beliefs.find(
    (belief) =>
      belief.basis &&
      belief.peerId === source.detail.peerId &&
      belief.test?.kind === "reply" &&
      Date.parse(source.at) > Date.parse(belief.predictionRecordedAt ?? belief.updatedAt) &&
      at > belief.test.afterGameTimeMs &&
      at <= belief.test.byGameTimeMs,
  );
}
export function groundReflection(
  reflection: NonNullable<Update["reflections"]>[number],
  sources: Episode[],
  state: CognitiveState,
  visible: Data,
) {
  const source = sources.find((e) => e.id === reflection.outcomeRef);
  if (source?.kind === "message") {
    const prediction = testedReply(source, state.beliefs);
    const deliveredPrediction = testedReply(
      source,
      Array.isArray(visible.beliefs) ? (visible.beliefs as CognitiveState["beliefs"]) : [],
    );
    const deliveredSource = (Array.isArray(visible.evidence) ? visible.evidence.map(object) : []).find(
      (e) => e.id === source.id,
    );
    const detail = object(deliveredSource?.detail);
    if (
      !prediction ||
      !deliveredPrediction ||
      !sameDeclaration(prediction, deliveredPrediction) ||
      detail.direction !== "incoming" ||
      detail.peerId !== source.detail.peerId ||
      !reflection.evidenceRefs.includes(source.id)
    )
      throw new FleetError("COGNITION_RECORDED_EXPECTATION_REQUIRED");
    const expected = prediction.prediction;
    const observed = `Incoming peer statement: ${utf8Prefix(episodeText(source), 180)}. Statement only; agreement/delivery unverified.`;
    return groundedRevision(reflection, source.id, expected, observed);
  }
  if (source?.kind !== "receipt" || !reflection.evidenceRefs.includes(source.id))
    throw new FleetError("COGNITION_RECORDED_OUTCOME_REQUIRED");
  const detail = source.detail,
    receipt = object(detail.receipt);
  const kind = String(object(detail.action).kind ?? detail.actionKind ?? "unknown");
  const code = receipt.code ?? detail.code;
  if (typeof detail.intent !== "string" || !detail.intent.trim())
    throw new FleetError("COGNITION_RECORDED_EXPECTATION_REQUIRED");
  const rejectedBeforeSubmission =
    detail.source === "controller_rejection" && detail.submitted === false && detail.committed === false;
  const committed = ["COMMITTED", "ALREADY_COMMITTED"].includes(String(code));
  if (
    typeof code !== "string" ||
    (!rejectedBeforeSubmission &&
      (!detail.commandId ||
        !["receipt", "explicit_rejection"].includes(String(detail.source)) ||
        detail.committed !== committed))
  )
    throw new FleetError("COGNITION_RECORDED_OUTCOME_REQUIRED");
  const expected = utf8Prefix(detail.intent, 300);
  const observed = `${kind}: ${code}; ${rejectedBeforeSubmission ? "not submitted" : committed ? "command committed; later completion unknown" : "command not committed"}.`;
  return groundedRevision(reflection, source.id, expected, observed);
}
function groundedRevision(
  reflection: NonNullable<Update["reflections"]>[number],
  outcomeRef: string,
  expected: string,
  observed: string,
) {
  if (
    (reflection.expected !== undefined && reflection.expected !== expected) ||
    (reflection.observed !== undefined && reflection.observed !== observed)
  )
    throw new FleetError("COGNITION_OUTCOME_MISMATCH");
  if (reflection.revision.length < 20) throw new FleetError("COGNITION_REFLECTION_NOT_SPECIFIC");
  return {
    outcomeRef,
    expected,
    observed,
    revision: reflection.revision,
    evidenceRefs: [...new Set(reflection.evidenceRefs)],
  };
}
export function selectCognitiveEvidence(
  episodes: Episode[],
  currentRef: string,
  ranked: Episode[],
  reflected: Set<string>,
  state: CognitiveState,
  acceptedPair = false,
) {
  const incoming =
    ranked.find(
      (e) =>
        e.kind === "message" &&
        e.detail.direction === "incoming" &&
        !state.beliefs.some((b) => b.basis?.sourceId === e.id && b.evidenceQuote),
    ) ?? ranked.find((e) => e.kind === "message" && e.detail.direction === "incoming");
  const recentReceipt = episodes.find((e) => {
    if (reflected.has(e.id) || !isWorldResult(e)) return false;
    try {
      groundReflection({ outcomeRef: e.id, revision: "Eligible recorded outcome", evidenceRefs: [e.id] }, [e], state, {
        evidence: [e],
        beliefs: state.beliefs,
      });
      return true;
    } catch {
      return false;
    }
  });
  const selected = [
    episodes.find((e) => e.id === currentRef),
    ...(acceptedPair ? ranked.slice(0, 2) : []),
    incoming,
    recentReceipt,
    ...ranked,
  ]
    .filter((e): e is Episode => !!e)
    .filter((e, i, list) => list.findIndex((item) => item.id === e.id) === i)
    .slice(0, 5);
  return { selected, incoming, recentReceipt };
}
export class Cognition {
  constructor(
    private store: Store,
    private recall?: RecallPort,
  ) {}
  async capture(
    claim: Claim,
    kind: "observation" | "message" | "agreement" | "receipt",
    source: string,
    detail: Data,
  ): Promise<string> {
    // Private bodies stay encrypted. Bound the representation and state omissions.
    let body = object(scrub(detail));
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized) > 3000)
      body = {
        ...compactEpisode({ id: "", at: "", kind, detail: body }, 1200),
        originalBytes: Buffer.byteLength(serialized),
        coverage: "Partial observed body; obtain the original read before relying on omitted details.",
      };
    const sourceKey = `${kind}:${createHash("sha256").update(source).digest("hex")}`;
    return transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      const existing = (
        await c.query("SELECT id FROM cognitive_episodes WHERE agent_id=$1 AND source_key=$2", [
          claim.agentId,
          sourceKey,
        ])
      ).rows[0];
      if (existing) return existing.id;
      const id = randomUUID();
      await c.query(
        "INSERT INTO cognitive_episodes(id,agent_id,cohort_id,turn_id,source_key,occurred_at,kind,detail_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          claim.agentId,
          claim.cohortId,
          claim.id,
          sourceKey,
          this.store.now(),
          kind,
          this.store.vault.encrypt(body, `episode:${claim.agentId}:${id}`),
        ],
      );
      // Bound storage independently of model selection or output frequency.
      await this.trim(c, claim.agentId, [id]);
      return id;
    });
  }
  private async load(agentId: string) {
    const row = (await this.store.pool.query("SELECT * FROM cognitive_states WHERE agent_id=$1", [agentId])).rows[0];
    const state = row
      ? clean(
          this.store.vault.decrypt<CognitiveState>(row.detail_cipher, `cognition:${agentId}`),
          this.store.now().getTime(),
        )
      : empty();
    return { version: row?.version ?? 0, state };
  }
  private async trim(client: PoolClient, agentId: string, current: string[]) {
    const rows = (
      await client.query("SELECT * FROM cognitive_episodes WHERE agent_id=$1 ORDER BY occurred_at DESC,sequence DESC", [
        agentId,
      ])
    ).rows;
    if (rows.length <= 200) return;
    const row = (await client.query("SELECT detail_cipher FROM cognitive_states WHERE agent_id=$1", [agentId])).rows[0];
    const state = row
      ? clean(
          this.store.vault.decrypt<CognitiveState>(row.detail_cipher, `cognition:${agentId}`),
          this.store.now().getTime(),
        )
      : empty();
    const anchors = [
      ...(state.plan?.evidenceRefs ?? []),
      ...state.beliefs.flatMap((b) => b.evidenceRefs),
      ...state.reflections.flatMap((r) => r.evidenceRefs),
    ];
    const retained = new Set([...current, ...anchors, ...rows.slice(0, 80).map((r) => r.id)]);
    const scored = rows
      .map((r) => {
        const detail = this.store.vault.decrypt<Data>(r.detail_cipher, `episode:${agentId}:${r.id}`);
        return {
          id: r.id,
          importance:
            typeof detail.importance === "number"
              ? detail.importance
              : r.kind === "receipt" || r.kind === "agreement"
                ? 4
                : r.kind === "message"
                  ? 3
                  : 1,
        };
      })
      .sort((a, b) => b.importance - a.importance);
    for (const row of scored) {
      if (retained.size >= 200) break;
      retained.add(row.id);
    }
    await client.query("DELETE FROM cognitive_episodes WHERE agent_id=$1 AND NOT(id=ANY($2::uuid[]))", [
      agentId,
      [...retained],
    ]);
  }
  private async episodes(agentId: string): Promise<Episode[]> {
    const rows = (
      await this.store.pool.query(
        "SELECT * FROM cognitive_episodes WHERE agent_id=$1 AND occurred_at>$2 ORDER BY occurred_at DESC,sequence DESC LIMIT 200",
        [agentId, new Date(this.store.now().getTime() - lifetime)],
      )
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      at: r.occurred_at.toISOString(),
      kind: r.kind,
      detail: this.store.vault.decrypt<Data>(r.detail_cipher, `episode:${agentId}:${r.id}`),
    }));
  }
  async context(claim: Claim, peers: string[], currentRef: string, query: string): Promise<Data> {
    await this.store.active(claim);
    const { version, state } = await this.load(claim.agentId),
      episodes = await this.episodes(claim.agentId);
    const ranked = rankEpisodes(
      episodes.filter((e) => e.id !== currentRef),
      `${query} ${state.plan?.goal ?? ""}`,
      peers,
      this.store.now().getTime(),
    );
    let recallStatus: Data = {
      route: "relevance-recency-importance",
      coverage: "Bounded deterministic recall; full history is not delivered.",
    };
    if (claim.cohort.model?.recallAssist && ranked.length >= 2) {
      try {
        if (!this.recall) throw new FleetError("LAYA_NOT_CONFIGURED");
        const candidates = ranked.slice(0, 2).map((e) => ({ id: e.id, text: utf8Prefix(episodeText(e), 220) }));
        const selected = await this.recall.choose(
          `${state.plan?.goal ?? query}`.slice(0, 240),
          candidates,
          AbortSignal.timeout(Math.max(1, Math.min(3000, claim.deadline.getTime() - this.store.now().getTime()))),
        );
        const index = ranked.findIndex((e) => e.id === selected.id);
        if (index < 0 || index >= candidates.length) throw new FleetError("LAYA_INVALID_SELECTION");
        ranked.unshift(...ranked.splice(index, 1));
        recallStatus = {
          route: "laya-recall-v1",
          certificate: selected.certificate,
          probability: selected.probability,
          candidateIds: candidates.map((candidate) => candidate.id),
          selectedId: selected.id,
          role: "Advisory recall order only; no command authority.",
        };
      } catch (error) {
        recallStatus = {
          route: "relevance-recency-importance",
          assist: error instanceof FleetError && error.code === "LAYA_ABSTAINED" ? "abstained" : "unavailable",
          code: error instanceof FleetError ? error.code : "LAYA_UNAVAILABLE",
          coverage: "Kept deterministic recall. LLM decision remains enabled; no facts or permissions inferred.",
        };
      }
    }
    const reflected = new Set(
      (
        await this.store.pool.query("SELECT outcome_id FROM cognitive_reflection_keys WHERE agent_id=$1", [
          claim.agentId,
        ])
      ).rows.map((r) => r.outcome_id),
    );
    const { selected, incoming, recentReceipt } = selectCognitiveEvidence(
      episodes,
      currentRef,
      ranked,
      reflected,
      state,
      recallStatus.route === "laya-recall-v1",
    );
    const evidence = selected.map((e) => ({ ...e, detail: compactEpisode(e) }));
    const groundedBeliefs = state.beliefs.filter((b) => b.basis && b.test && b.evidenceQuote);
    const groundedReflections = state.reflections.filter(
      (r) =>
        r.outcomeRef &&
        r.reviewProtocol === "observed-first" &&
        episodes.some((e) => e.id === r.outcomeRef && isWorldResult(e)),
    );
    const beliefs = [...groundedBeliefs]
      .sort(
        (a, b) =>
          Number(peers.includes(b.peerId)) - Number(peers.includes(a.peerId)) || b.updatedAt.localeCompare(a.updatedAt),
      )
      .slice(0, 3);
    const allIds = new Set(episodes.map((e) => e.id));
    return {
      version,
      nativeAnalysis: true,
      currentEvidenceId: currentRef,
      latestReceiptId: recentReceipt?.id,
      analysisEvidenceIds: [incoming?.id, recentReceipt?.id].filter(Boolean),
      reflectedOutcomeIds: selected.filter((e) => reflected.has(e.id)).map((e) => e.id),
      plan: state.plan,
      beliefs,
      reflections: groundedReflections.slice(-2),
      evidence,
      evidenceAvailability: Object.fromEntries(
        [
          ...new Set([
            ...(state.plan?.evidenceRefs ?? []),
            ...beliefs.flatMap((b) => b.evidenceRefs),
            ...groundedReflections.slice(-2).flatMap((r) => r.evidenceRefs),
          ]),
        ].map((id) => [id, allIds.has(id) ? "retained" : "expired_or_evicted"]),
      ),
      recall: recallStatus,
      knownPeerIds: [
        ...new Set([
          ...selected.map((e) => e.detail.peerId).filter((p): p is string => typeof p === "string"),
          ...peers,
        ]),
      ].slice(0, 40),
      coverage: {
        retainedEpisodes: episodes.length,
        deliveredEpisodes: evidence.length,
        omittedBeliefs: groundedBeliefs.length - beliefs.length,
        legacyUnverifiedBeliefs: state.beliefs.length - groundedBeliefs.length,
        legacyUnverifiedReflections: state.reflections.filter((r) => !r.outcomeRef).length,
        omittedProtocolReflections: state.reflections.filter((r) => r.outcomeRef).length - groundedReflections.length,
        interpretation:
          "Hypotheses remain subjective. Assessment tests only the typed reply/agreement event, not motives or reliability. Cite delivered sources; current facts prevail.",
      },
    };
  }
  async apply(claim: Claim, decision: number, raw: unknown, delivered: Data) {
    const parsed = CognitiveUpdate.safeParse(raw);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(raw)) > 5000)
      throw new FleetError("COGNITION_INVALID_UPDATE");
    const update = parsed.data,
      evidence = Array.isArray(delivered.evidence) ? delivered.evidence.map(object) : [],
      allowed = new Set(evidence.map((e) => e.id)),
      peers = new Set(Array.isArray(delivered.knownPeerIds) ? delivered.knownPeerIds : []);
    const cited = [
      ...(update.plan?.evidenceRefs ?? []),
      ...(update.beliefs ?? []).flatMap((b) => b.evidenceRefs),
      ...(update.reflections ?? []).flatMap((r) => r.evidenceRefs),
      ...(update.memories ?? []).flatMap((m) => m.evidenceRefs),
    ];
    if (cited.some((id) => !allowed.has(id))) throw new FleetError("COGNITION_EVIDENCE_NOT_DELIVERED");
    if (cited.some((id) => evidence.find((e) => e.id === id)?.kind === "interpretation"))
      throw new FleetError("COGNITION_INTERPRETATION_NOT_EVIDENCE");
    if ((update.beliefs ?? []).some((b) => !peers.has(b.peerId))) throw new FleetError("COGNITION_PEER_NOT_OBSERVED");
    await transaction(this.store.pool, async (c) => {
      await c.query("SELECT id FROM cohorts WHERE id=$1 FOR UPDATE", [claim.cohortId]);
      await this.store.active(claim, c);
      const existing = (
        await c.query("SELECT detail_cipher FROM cognitive_updates WHERE turn_id=$1 AND decision=$2", [
          claim.id,
          decision,
        ])
      ).rows[0];
      if (existing) {
        const prior = this.store.vault.decrypt<Update>(
          existing.detail_cipher,
          `cognitive-update:${claim.id}:${decision}`,
        );
        if (JSON.stringify(prior) !== JSON.stringify(update)) throw new FleetError("COGNITION_UPDATE_CONFLICT");
        return;
      }
      const row = (await c.query("SELECT * FROM cognitive_states WHERE agent_id=$1 FOR UPDATE", [claim.agentId]))
        .rows[0];
      const version = row?.version ?? 0;
      if (version !== update.expectedVersion || version !== delivered.version)
        throw new FleetError("COGNITION_STALE_VERSION");
      // Require the referenced evidence still to belong to this agent at commit.
      const sources = await c.query(
        "SELECT id,kind,occurred_at,detail_cipher FROM cognitive_episodes WHERE agent_id=$1 AND id=ANY($2::uuid[]) AND occurred_at>$3",
        [
          claim.agentId,
          [
            ...new Set([
              ...cited,
              ...evidence.filter((e) => e.kind !== "interpretation").map((e) => String(e.id)),
              ...(typeof delivered.currentEvidenceId === "string" && allowed.has(delivered.currentEvidenceId)
                ? [delivered.currentEvidenceId]
                : []),
            ]),
          ],
          new Date(this.store.now().getTime() - lifetime),
        ],
      );
      if (cited.some((id) => !sources.rows.some((e) => e.id === id)))
        throw new FleetError("COGNITION_EVIDENCE_EXPIRED");
      const state = row
        ? clean(
            this.store.vault.decrypt<CognitiveState>(row.detail_cipher, `cognition:${claim.agentId}`),
            this.store.now().getTime(),
          )
        : empty();
      const sourceEpisodes: Episode[] = sources.rows.map((e) => ({
        id: e.id,
        kind: e.kind,
        at: e.occurred_at.toISOString(),
        detail: this.store.vault.decrypt<Data>(e.detail_cipher, `episode:${claim.agentId}:${e.id}`),
      }));
      validateBeliefs(
        update.beliefs ?? [],
        state,
        sourceEpisodes,
        sourceEpisodes.reduce<number | undefined>((latest, e) => {
          const at = gameTime(e);
          return at === undefined ? latest : Math.max(latest ?? 0, at);
        }, undefined),
        evidence,
      );
      const groundedReflections = (update.reflections ?? []).map((r) =>
        groundReflection(r, sourceEpisodes, state, delivered),
      );
      const beforeState = JSON.stringify(state);
      const updatedAt = this.store.now().toISOString();
      if (update.plan !== undefined && !sameDeclaration(state.plan, update.plan))
        state.plan = update.plan ? { ...update.plan, updatedAt } : null;
      let beliefsRevised = 0,
        reflectionsAdded = 0;
      for (const raw of update.beliefs ?? []) {
        const b = { ...raw, evidenceRefs: [...new Set(raw.evidenceRefs)] };
        if (
          sameDeclaration(
            state.beliefs.find((old) => old.peerId === b.peerId),
            b,
          )
        )
          continue;
        beliefsRevised++;
        const prior = state.beliefs.find((old) => old.peerId === b.peerId);
        const samePrediction =
          prior?.prediction === b.prediction && JSON.stringify(prior?.test) === JSON.stringify(b.test);
        const predictionRecordedAt = samePrediction
          ? (prior?.predictionRecordedAt ?? prior?.updatedAt ?? updatedAt)
          : updatedAt;
        state.beliefs = state.beliefs.filter((old) => old.peerId !== b.peerId);
        state.beliefs.push({ ...b, updatedAt, predictionRecordedAt });
      }
      state.beliefs = state.beliefs.slice(-12);
      for (const r of groundedReflections) {
        const inserted = await c.query(
          "INSERT INTO cognitive_reflection_keys(agent_id,outcome_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING outcome_id",
          [claim.agentId, r.outcomeRef, this.store.now()],
        );
        if (!inserted.rowCount) continue;
        reflectionsAdded++;
        const echoed =
          update.reflections?.find((proposal) => proposal.outcomeRef === r.outcomeRef)?.observed !== undefined;
        state.reflections.push({ ...r, updatedAt, ...(echoed ? { reviewProtocol: "observed-first" as const } : {}) });
      }
      state.reflections = state.reflections.slice(-8);
      const changed = JSON.stringify(state) !== beforeState || !!update.memories?.length;
      if (changed)
        await c.query(
          "INSERT INTO cognitive_states(agent_id,cohort_id,version,updated_at,detail_cipher) VALUES($1,$2,$3,$4,$5) ON CONFLICT(agent_id) DO UPDATE SET version=EXCLUDED.version,updated_at=EXCLUDED.updated_at,detail_cipher=EXCLUDED.detail_cipher",
          [
            claim.agentId,
            claim.cohortId,
            version + 1,
            this.store.now(),
            this.store.vault.encrypt(state, `cognition:${claim.agentId}`),
          ],
        );
      const newIds: string[] = [];
      for (const [index, memory] of (update.memories ?? []).entries()) {
        const id = randomUUID();
        newIds.push(id);
        await c.query(
          "INSERT INTO cognitive_episodes(id,agent_id,cohort_id,turn_id,source_key,occurred_at,kind,detail_cipher) VALUES($1,$2,$3,$4,$5,$6,'interpretation',$7)",
          [
            id,
            claim.agentId,
            claim.cohortId,
            claim.id,
            `interpretation:${claim.id}:${decision}:${index}`,
            this.store.now(),
            this.store.vault.encrypt(
              {
                ...memory,
                coverage:
                  "Model-authored interpretation of cited observations; not independent evidence or a committed action.",
              },
              `episode:${claim.agentId}:${id}`,
            ),
          ],
        );
      }
      await this.trim(c, claim.agentId, newIds);
      await c.query("INSERT INTO cognitive_updates VALUES($1,$2,$3,$4,$5)", [
        claim.id,
        decision,
        claim.agentId,
        this.store.now(),
        this.store.vault.encrypt(update, `cognitive-update:${claim.id}:${decision}`),
      ]);
      await new Observability(this.store).record(
        claim,
        "ready",
        changed ? "LLM revised memory, plan or social hypotheses" : "LLM reviewed continuity without a revision",
        {
          version: version + Number(changed),
          changed,
          decision,
          review: update.review ? { beliefs: update.review.beliefs, reflection: update.review.reflection } : null,
          planStatus: state.plan?.status ?? null,
          beliefsRevised,
          reflections: reflectionsAdded,
          duplicateReflectionsSkipped: (update.reflections?.length ?? 0) - reflectionsAdded,
          memories: update.memories?.length ?? 0,
          meaning: "Subjective state; no game command or authority changed.",
        },
        c,
      );
    });
  }
  async inspect(agentId: string): Promise<Data> {
    const agent = await this.store.agent(agentId),
      cohort = await this.store.cohort(agent.cohort_id);
    if (!cohort.observation_consent)
      return {
        enabled: !!cohort.model?.cognition,
        withheld: true,
        coverage: "Cognitive detail requires observation consent.",
      };
    const { version, state } = await this.load(agentId),
      episodes = await this.episodes(agentId);
    const latest = (
      await this.store.pool.query(
        "SELECT turn_id,decision,detail_cipher FROM cognitive_updates WHERE agent_id=$1 ORDER BY recorded_at DESC,decision DESC LIMIT 1",
        [agentId],
      )
    ).rows[0];
    const latestReview = latest
      ? this.store.vault.decrypt<Update>(latest.detail_cipher, `cognitive-update:${latest.turn_id}:${latest.decision}`)
          .review
      : undefined;
    const reviewEvents = latest
      ? (
          await this.store.pool.query(
            "SELECT id,detail_cipher FROM turn_events WHERE turn_id=$1 AND label IN('LLM revised memory, plan or social hypotheses','LLM reviewed continuity without a revision') ORDER BY sequence DESC",
            [latest.turn_id],
          )
        ).rows
      : [];
    const actual = reviewEvents
      .map((e) => this.store.vault.decrypt<Data>(e.detail_cipher, `turn-event:${e.id}`))
      .find((detail) => detail.decision === latest?.decision);
    return {
      enabled: !!cohort.model?.cognition,
      version,
      ...state,
      beliefs: state.beliefs.map((b) => ({
        ...b,
        grounding: b.basis && b.test && b.evidenceQuote ? "source_checked_subjective" : "legacy_unverified",
      })),
      reflections: state.reflections.map((r) => ({
        ...r,
        grounding: r.outcomeRef && r.reviewProtocol === "observed-first" ? "recorded_outcome" : "legacy_unverified",
      })),
      latestReview,
      latestReviewResult: actual
        ? {
            beliefsRevised: actual.beliefsRevised,
            reflectionsAdded: actual.reflections,
            duplicateReflectionsSkipped: actual.duplicateReflectionsSkipped,
          }
        : null,
      episodes: episodes.slice(0, 20),
      coverage:
        "Latest 20 of at most 200 retained account-owned episodes. Interpretations, plans and hypotheses are not verified game facts.",
    };
  }
  async prune() {
    const before = new Date(this.store.now().getTime() - lifetime);
    await this.store.pool.query("DELETE FROM cognitive_episodes WHERE occurred_at<$1", [before]);
    await this.store.pool.query("DELETE FROM cognitive_states WHERE updated_at<$1", [before]);
    await this.store.pool.query("DELETE FROM cognitive_updates WHERE recorded_at<$1", [before]);
  }
}
