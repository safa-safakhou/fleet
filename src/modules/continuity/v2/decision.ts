import { createHash } from "node:crypto";
import { z } from "zod";
import { type Data, FleetError, object } from "../../../domain.js";
import { expandFactTables, factTable } from "../../../fact-table.js";
import type { ActionOutcome, Observation } from "../../../platform/contracts.js";
import type { DecisionContext } from "../../decision-step/v1/context.js";
import { BoundedDecisionStep, ReactiveDecision, RejectedDecision } from "../../decision-step/v1/engine.js";
import {
  type EvidenceSelection,
  type Interpretation,
  type Original,
  selectNegotiationEvidence,
} from "../../evidence/negotiation/v1.js";
import { shareGenerationSchema } from "../../generation-schema/v1.js";

const Memory = z
  .object({
    memories: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            text: z.string().min(1).max(600),
            evidenceRefs: z.array(z.string().max(100)).min(1).max(16),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();
const Envelope = z.object({ decision: ReactiveDecision, memory: Memory.optional() }).strict();
const codec = "negotiation-memory.2";
function packetEvidence(value: ReturnType<typeof selectNegotiationEvidence>) {
  return {
    ...value,
    encoding: "fleet.fact-table.v1",
    bundles: value.bundles.map((bundle) => ({ ...bundle, originals: factTable(bundle.originals) })),
  };
}
type Index = { key: string; id: string; kind: Original["kind"]; createdAt: string };
type State = { index: Index[]; memories: Interpretation[]; ack: Data };
const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
/** Version two composes the same bounded decision step with an independent codec.
 * Original observations/receipts are deterministic evidence, never authored learning.
 */
export class NegotiationDecisionStep extends BoundedDecisionStep {
  protected readQueryContract(ctx: DecisionContext) {
    return ctx.readQuerySchema?.() ?? Promise.resolve(undefined);
  }
  protected packEveryObservation() {
    return true;
  }
  protected decisionSchema: Data = z.toJSONSchema(Envelope, { target: "draft-7" });
  private schemaCache = new WeakMap<Data, { key: string; schema: Data }>();
  protected generationSchema(payload: Data, base: Data) {
    const packet = object(payload.negotiationMemory),
      delivered = new Set((packet.deliveredIds ?? []) as string[]);
    const ids = [
      ...new Set(
        rows(object(expandFactTables(packet)).bundles).flatMap((b) => rows(b.originals).map((o) => String(o.id))),
      ),
    ].filter((id) => delivered.has(id));
    const key = JSON.stringify(ids),
      cached = this.schemaCache.get(base);
    if (cached?.key === key) return cached.schema;
    const schema = structuredClone(base),
      memory = object(object(schema.properties).memory);
    const memories = object(object(memory.properties).memories);
    if (ids.length) {
      const refs = object(object(object(memories.items).properties).evidenceRefs);
      refs.items = { ...object(refs.items), enum: ids };
    } else memories.maxItems = 0;
    const shared = shareGenerationSchema(schema, { compactNames: true, inlineSingleUse: true });
    this.schemaCache.set(base, { key, schema: shared });
    return shared;
  }
  private version = 0;
  private saved: State = { index: [], memories: [], ack: { status: "no_op", reason: "no_prior_write" } };
  private selection?: EvidenceSelection;
  protected additionalInstructions() {
    return " Version two: return {decision:<advertised decision>,memory?:{memories:[{id,text,evidenceRefs}]}}. Memory is optional subjective interpretation, not owner intent or a command. Cite only delivered original IDs. Summary narration never writes memory. memoryWriteAck reports the previous accepted/rejected/no_op attempt. Original receipts remain factual evidence when no memory is written. Missing or omitted support is unavailable; never reconstruct it from a summary. An open offer is a proposal, not a contract: selfConsent and peerConsent are separate, and no signature, income, delivery or immediate stock transfer follows from proposing it. Use only the observed current offer version and your own youSend/youReceive directions. Founding allowance and authority ceilings are not ordinary trade stock. A resource-receive objective is not fulfilled by sending that resource or by waiting on own production. Signature is not income; closed status is not proof of fulfillment. Read current scope when needed.";
  }
  async runContext(ctx: DecisionContext) {
    const loaded = await ctx.state.load(codec);
    if (loaded) {
      this.version = loaded.version;
      this.saved = {
        index: (loaded.value.index as Index[]) ?? [],
        memories: (loaded.value.memories as Interpretation[]) ?? [],
        ack: object(loaded.value.ack),
      };
    }
    const project = (o: Observation) => ctx.projectObservation?.(o, { id: "negotiation", version: "2" }) ?? o;
    return super.runContext({
      ...ctx,
      observation: project(ctx.observation),
      observe: async (q) => project(await ctx.observe(q)),
    });
  }
  private async save(ctx: DecisionContext) {
    const result = await ctx.state.accept({ codec, expectedVersion: this.version, value: this.saved });
    if (!result.accepted) throw new FleetError("MEMORY_CONSENT_REQUIRED", true);
    this.version = result.version;
  }
  private async original(
    ctx: DecisionContext,
    key: string,
    kind: Original["kind"],
    causalKey: string,
    detail: Data,
    sourceRefs: string[],
    entities: string[],
    at: string,
  ) {
    if (this.saved.index.some((i) => i.key === key)) return;
    const original: Omit<Original, "id"> = {
      bindingId: ctx.binding.id,
      kind,
      causalKey,
      detail,
      sourceRefs,
      entityRefs: entities,
      goalRefs: [],
      createdAt: at,
      expiresAt: new Date(Date.parse(at) + 30 * 86400000).toISOString(),
    };
    const evidence = await ctx.evidence.capture({ kind: "negotiation-original.v1", detail: original, sourceRefs });
    if (evidence.id === "unavailable") return;
    this.saved.index.push({ key, id: evidence.id, kind, createdAt: at });
    // Keep outcome/obligation originals before repeated state observations. No summary
    // is substituted for a removed original; retained() proves continued support.
    this.saved.index.sort(
      (a, b) =>
        (a.kind === "observation" ? 1 : 0) - (b.kind === "observation" ? 1 : 0) ||
        b.createdAt.localeCompare(a.createdAt) ||
        a.id.localeCompare(b.id),
    );
    this.saved.index = this.saved.index.slice(0, 64);
  }
  protected async extension(ctx: DecisionContext, observation: Observation) {
    const negotiation = object(observation.payload.negotiation),
      at = observation.observedAt;
    for (const record of [...rows(negotiation.offers), ...rows(negotiation.contracts)]) {
      const kind: Original["kind"] = record.deliveries !== undefined ? "outcome" : "promise";
      const { asOfGameTimeMs: _time, sourceRefs: _refs, ...detail } = record;
      const key = createHash("sha256").update(JSON.stringify(detail)).digest("hex");
      await this.original(
        ctx,
        key,
        kind,
        String(record.offerId ?? record.id),
        detail,
        observation.sourceRefs,
        typeof record.peerId === "string" ? [record.peerId] : [],
        at,
      );
    }
    // Only explicit continuity facts are causal originals. Bulk stock snapshots do
    // not displace obligations/outcomes and need no authored memory update.
    for (const fact of observation.continuity?.facts ?? []) {
      await this.original(
        ctx,
        createHash("sha256").update(JSON.stringify(fact)).digest("hex"),
        fact.kind === "outcome" ? "outcome" : fact.kind === "commitment" ? "promise" : "observation",
        `${fact.subject}:${fact.predicate}`,
        fact,
        [fact.sourceRef],
        [fact.subject],
        at,
      );
    }
    const retained = await ctx.evidence.retained(this.saved.index.map((i) => i.id));
    const originals = retained
      .filter((e) => e.kind === "negotiation-original.v1")
      .map((e) => ({ ...e.detail, id: e.id }) as Original);
    this.selection = {
      bindingId: ctx.binding.id,
      goalRefs: [JSON.stringify(ctx.accountObjective?.(observation) ?? ctx.goal ?? "")],
      entityRefs: [...rows(negotiation.offers), ...rows(negotiation.contracts)].map((o) => String(o.peerId)),
      conversationRefs: [],
      originals,
      interpretations: this.saved.memories,
      now: at,
      maxBytes: Math.min(10000, Math.floor(ctx.configuration.budget.inputByteLimit / 2)),
    };
    await this.save(ctx);
    return {
      negotiationMemory: packetEvidence(selectNegotiationEvidence(this.selection)),
      memoryWriteAck: this.saved.ack,
    };
  }
  protected fitExtension(_payload: Data) {
    /* Already losslessly encoded; retain whole causal bundles first. */
  }
  protected reduceExtension(payload: Data) {
    if (!this.selection || this.selection.maxBytes <= 1200) return false;
    this.selection.maxBytes = Math.max(1200, Math.floor(this.selection.maxBytes * 0.7));
    payload.negotiationMemory = packetEvidence(selectNegotiationEvidence(this.selection));
    return true;
  }
  protected async decode(ctx: DecisionContext, raw: unknown, payload: Data) {
    const parsed = Envelope.safeParse(raw);
    if (!parsed.success) return ReactiveDecision.safeParse(null);
    const memory = parsed.data.memory;
    const delivered = new Set((object(payload.negotiationMemory).deliveredIds ?? []) as string[]);
    const originals = new Set(
      rows(object(expandFactTables(payload.negotiationMemory)).bundles).flatMap((b) =>
        rows(b.originals).map((o) => String(o.id)),
      ),
    );
    if (!memory) {
      this.saved.ack = { status: "no_op", reason: "no_authored_update" };
      await this.save(ctx);
    } else if (memory.memories.some((m) => m.evidenceRefs.some((id) => !delivered.has(id) || !originals.has(id)))) {
      this.saved.ack = { status: "rejected", reason: "missing_delivered_original" };
      await this.save(ctx);
      throw new RejectedDecision(
        "MEMORY_UNSUPPORTED",
        "Memory not saved; cite delivered original evidence, or omit the optional update. No command was prepared.",
      );
    } else {
      const unchanged = JSON.stringify(memory.memories) === JSON.stringify(this.saved.memories);
      this.saved.memories = memory.memories;
      this.saved.ack = {
        status: unchanged ? "no_op" : "accepted",
        reason: unchanged ? "unchanged" : "grounded_update",
      };
      await this.save(ctx);
    }
    return ReactiveDecision.safeParse(parsed.data.decision);
  }
  protected async afterCommand(ctx: DecisionContext, outcome: ActionOutcome) {
    await this.original(
      ctx,
      `command:${outcome.commandId}`,
      "outcome",
      `command:${outcome.commandId}`,
      outcome,
      outcome.sourceRefs,
      [],
      ctx.observation.observedAt,
    );
    await this.save(ctx);
  }
}
