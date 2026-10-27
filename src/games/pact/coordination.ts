import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { type Data, FleetError, type GamePort, object, ProposalRejection } from "../../domain.js";
import { expandFactTables } from "../../fact-table.js";
import { RemoteRejection } from "../../http.js";
import { shareGenerationSchema } from "../../modules/generation-schema/v1.js";
import { type ActionEffects, actionIntentDigest, type EffectClaim } from "../../platform/action-effects.js";
import type { ActionIntent, BindingRef, Observation, Proposal, ProposalValidation } from "../../platform/contracts.js";
import type { DecisionGrounding } from "../../platform/native-grounding.js";
import { normalizePactEffects, pactEffectCommand, pactRemoteGuard } from "./action-effects.js";
import { pactActionBasis } from "./goal-state.js";
import { observedTradePerspective } from "./trade.js";

type Option = {
  textFields?: string[];
  commandId: string;
  payload: Data;
  claims: EffectClaim[];
  sourceRefs: string[];
  expectedOutcome: Data;
};
function matchesOption(option: Option, payload: Data) {
  if (!option.textFields?.includes("body")) return isDeepStrictEqual(option.payload, payload);
  return (
    payload.kind === "game.message.send" &&
    typeof payload.body === "string" &&
    payload.body.length > 0 &&
    payload.body.length <= 4000 &&
    isDeepStrictEqual({ ...payload, body: option.payload.body }, option.payload)
  );
}
const rows = (raw: unknown): Data[] => (Array.isArray(raw) ? raw.map(object) : []);
/** Normalize only native per-command promise keys for reasoning comparisons.
 * Guarded commit still receives the full native quote with the real command UUID. */
export function coordinationClaims(quote: ActionEffects, commandId: string): EffectClaim[] {
  const prefix = (
    { "game.message.send": "message", "game.training.queue": "training", "game.supply.offer": "offer" } as Record<
      string,
      string
    >
  )[quote.actionKey];
  return quote.claims.map((c) =>
    prefix && c.kind === "promise" && c.key === `${prefix}:${commandId}`
      ? { ...c, key: `${prefix}:current-command` }
      : c,
  );
}

/** Optional PACT-specific protocol. Costs, capacities and atomic staleness all come from PACT. */
export class PactCoordination {
  private leaseOpened = false;
  private snapshots = new Map<
    string,
    { revision: string; options: Option[]; sourceRefs: string[]; ownerIntent: unknown; ownerEpoch: number }
  >();
  private ownerIntent: unknown;
  private ownerEpoch = 0;
  private validated = new Map<string, { digest: string; command: Data; quote: ActionEffects }>();
  constructor(
    private binding: BindingRef,
    private game: GamePort,
    private now: () => Date,
  ) {}
  async ensureLease() {
    if (!this.leaseOpened) {
      await this.game.open();
      this.leaseOpened = true;
    }
  }
  private async quote(intent: ActionIntent) {
    if (!this.game.effects || !this.game.submitGuarded) throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
    const command = pactEffectCommand(this.binding, intent, this.now());
    const quote = normalizePactEffects(intent, command, await this.game.effects(command));
    if (
      quote.validUntil.clockId !== "utc" ||
      !Number.isFinite(Date.parse(quote.validUntil.value)) ||
      Date.parse(quote.validUntil.value) <= this.now().getTime()
    )
      throw new FleetError("EXPIRED", true);
    return { command, quote };
  }
  async observe(base: Observation): Promise<Observation> {
    const owner = object(object(base.payload.world).profile).kingdomId;
    if (owner !== undefined && owner !== this.binding.entityRef) throw new FleetError("IDENTITY_MISMATCH", true);
    // Opening/renewing changes native effect dependencies. Establish it once, before quoting,
    // and never renew/reacquire between proposal validation and guarded commit.
    await this.ensureLease();
    const support = await this.game.read("pact_decision_support_v2", {});
    if (support.schemaVersion !== "pact.decision-support.v2" || support.kingdomId !== this.binding.entityRef)
      throw new FleetError("INVALID_COORDINATION_SOURCE", true);
    const candidates = rows(support.candidates).filter((c) => c.kind === "action");
    const guide = object(base.payload.guide),
      world = object(base.payload.world);
    const allowed = object(world.authority).allowedActions ?? object(guide.mandate).allowedActions;
    if (Array.isArray(allowed) && allowed.includes("contact.request"))
      for (const peer of rows(object(base.payload.discovery).players)) {
        const id = peer.kingdomId;
        if (
          typeof id !== "string" ||
          id === this.binding.entityRef ||
          rows(guide.contacts).some((c) => c.kingdomId === id) ||
          rows(guide.contactRequests).some(
            (r) => r.status === "pending" && [r.kingdomId, r.senderKingdomId, r.recipientKingdomId].includes(id),
          )
        )
          continue;
        candidates.push({
          kind: "action",
          action: {
            kind: "game.contact.request",
            recipientKingdomId: id,
            note: "I would like to establish contact to discuss our kingdoms' goals. No agreement or delivery is promised.",
          },
        });
      }
    for (const request of rows(guide.contactRequests)) {
      if (request.direction === "incoming" && request.status === "pending" && typeof request.id === "string")
        for (const accept of [true, false])
          candidates.push({ kind: "action", action: { kind: "game.contact.answer", requestId: request.id, accept } });
    }
    for (const offer of rows(guide.openSupplyOffers)) {
      if (typeof offer.id === "string" && Number.isSafeInteger(offer.version))
        candidates.push({
          kind: "action",
          action: { kind: "game.supply.sign", offerId: offer.id, version: offer.version },
        });
    }
    const time = String(
      world.asOfGameTimeMs ?? (base.environmentTime.clockId === "pact.game-time-ms" ? base.environmentTime.value : ""),
    );
    if (/^\d+$/.test(time))
      for (const contact of rows(guide.contacts)) {
        if (typeof contact.kingdomId !== "string" || contact.kingdomId === this.binding.entityRef) continue;
        // The recipient is observed. Text is authored by the worker, then its exact
        // bytes and promises receive a native quote before coordinator selection.
        candidates.push({
          kind: "action",
          action: {
            kind: "game.message.send",
            recipientKingdomId: contact.kingdomId,
            body: `My authorized current view shows PACT game time ${time} ms. This reports an observed snapshot only.`,
          },
        });
      }
    const selected: Data[] = [],
      groups = new Map<string, Data[]>();
    // Interleave action families, with distinct building/unit targets before duplicate slots.
    // This is coverage, not a priority policy; quotes/admission remain native authority.
    for (const candidate of candidates) {
      const payload = object(candidate.action),
        key = String(payload.kind ?? "");
      const checks = object(candidate.checks),
        blockers = object(object(checks.admissionQuote).admission).blockers;
      if (
        !key ||
        ["affordable", "hallUnlocked", "queueFree", "capacityAvailable"].some((k) => checks[k] === false) ||
        (typeof checks.prerequisite === "string" && checks.prerequisite !== "ready") ||
        (Array.isArray(blockers) && blockers.length > 0)
      )
        continue;
      const items = groups.get(key) ?? [];
      items.push(payload);
      groups.set(key, items);
    }
    const queues = [...groups.values()].map((items) => {
      const seen = new Set<string>(),
        unique: Data[] = [],
        alternatives: Data[] = [];
      for (const p of items) {
        const key =
          p.kind === "game.building.queue"
            ? JSON.stringify([p.building, p.targetLevel])
            : p.kind === "game.training.queue"
              ? String(p.type)
              : JSON.stringify(p);
        (seen.has(key) ? alternatives : unique).push(p);
        seen.add(key);
      }
      return [...unique, ...alternatives];
    });
    for (let i = 0; selected.length < 8 && queues.some((q) => i < q.length); i++)
      for (const queue of queues) if (queue[i] && selected.length < 8) selected.push(queue[i]);
    let revision: string | undefined;
    const options: Option[] = [],
      capacities = new Map<string, ActionEffects["capacities"][number]>();
    for (const payload of selected) {
      const intent: ActionIntent = {
        commandId: randomUUID(),
        bindingId: this.binding.id,
        schemaId: "pact.action.v1",
        payload,
      };
      let q: ActionEffects;
      try {
        q = (await this.quote(intent)).quote;
      } catch (error) {
        if (
          error instanceof RemoteRejection &&
          ["INVALID_COMMAND", "FORBIDDEN", "EXPIRED", "STALE_VERSION"].includes(error.code)
        )
          continue;
        throw error;
      }
      if (revision !== undefined && q.revision !== revision)
        throw new FleetError("COORDINATION_SNAPSHOT_CHANGED", true);
      revision = q.revision;
      for (const cap of q.capacities) {
        const key = JSON.stringify([cap.schemaId, cap.key]),
          previous = capacities.get(key);
        // Wall-time communication credits can accrue while revision stays the same; the
        // lowest actually observed capacity is safe. No invented capacity or unit conversion.
        if (!previous || BigInt(cap.remainingUnits) < BigInt(previous.remainingUnits)) capacities.set(key, cap);
      }
      const claims = coordinationClaims(q, intent.commandId);
      if (
        claims.length > 16 ||
        claims.some((c) => c.key.length > 200 || (c.kind === "promise" && c.value.length > 200))
      )
        throw new FleetError("COORDINATION_CLAIM_LIMIT", true);
      const basis = pactActionBasis(base.payload);
      const trade = observedTradePerspective(payload, base.payload);
      const expectedOutcome = { ...(basis ? { actionKind: payload.kind, basis } : {}), ...(trade ? { trade } : {}) };
      options.push({
        commandId: intent.commandId,
        payload: structuredClone(payload),
        ...(payload.kind === "game.message.send" ? { textFields: ["body"] } : {}),
        claims,
        sourceRefs: q.sourceRefs,
        expectedOutcome,
      });
    }
    // Even an empty focus set must have a native revision; do not pretend world time is it.
    if (!revision) {
      // A read-only quote supplies an authoritative empty-menu revision; its hypothetical
      // action is never advertised or executed. Costs/capacities are not inferred as zero.
      const payload = candidates.length
        ? object(candidates[0].action)
        : { kind: "game.training.queue", type: "spearman", count: 1 };
      revision = (
        await this.quote({ commandId: randomUUID(), bindingId: this.binding.id, schemaId: "pact.action.v1", payload })
      ).quote.revision;
    }
    const schemas = new Map<string, "resource" | "authority" | "promise">();
    for (const c of options.flatMap((o) => o.claims)) {
      if (schemas.has(c.schemaId) && schemas.get(c.schemaId) !== c.kind)
        throw new FleetError("INVALID_CLAIM_PROTOCOL", true);
      schemas.set(c.schemaId, c.kind);
    }
    const focuses = [...new Set(options.map((o) => String(o.payload.kind)))].map((kind) => {
      const choices = options.filter((o) => o.payload.kind === kind);
      return {
        id: kind,
        sourceRefs: [...new Set(choices.flatMap((o) => o.sourceRefs))],
        observation: {
          options: choices,
          meaning:
            "Native effect quotes, not permissions or fulfilment. Choose a quoted payload, or abstain. For textFields choices, compose body for that recipient and return claims:[]; the host quotes the exact text before selection.",
        },
      };
    });
    const evidenceFrameRef = randomUUID(),
      ownerIntent = object(base.payload.world).ambition ?? null;
    // Native revisions protect effects, not the identity of delivered evidence.
    // Keep owner changes monotonic so a change and reversion still fences old choices.
    if (this.ownerIntent !== undefined && !isDeepStrictEqual(this.ownerIntent, ownerIntent)) this.ownerEpoch++;
    this.ownerIntent = structuredClone(ownerIntent);
    this.snapshots.set(evidenceFrameRef, {
      revision,
      ownerEpoch: this.ownerEpoch,
      options: structuredClone(options),
      ownerIntent: structuredClone(ownerIntent),
      sourceRefs: [...new Set(options.flatMap((o) => o.sourceRefs))],
    });
    // Session-local evidence only; bounded by the existing observation/call budget.
    if (this.snapshots.size > 16) this.snapshots.delete(this.snapshots.keys().next().value!);
    return {
      ...base,
      revision,
      sourceRefs: [...new Set([...base.sourceRefs, ...options.flatMap((o) => o.sourceRefs)])],
      coordination: {
        schemaVersion: "fleet.coordination.v1",
        evidenceFrameRef,
        atomicExpectedVersion: true,
        claimSchemas: [...schemas].map(([id, kind]) => ({ id, kind })),
        capacities: [...capacities.values()],
        promises: [],
        focuses,
        ownerPriorities: {},
        coverage: {
          completeWorld: false,
          nativeQuotes: options.length,
          candidateActionsObserved: candidates.length,
          candidateActionsOmitted: candidates.length - options.length,
          menu: "bounded native decision-support blueprints; other native commands are not enumerated",
        },
      },
    };
  }
  /** Re-admit an unchanged decision against current quotes; never replay a dispatched command. */
  async refreshProposal(proposal: Proposal, observation: Observation): Promise<Proposal> {
    const old = this.snapshots.get(proposal.evidenceFrameRef ?? "");
    const current = this.snapshots.get(observation.coordination?.evidenceFrameRef ?? "");
    if (!old) throw new FleetError("COORDINATION_ORIGIN_FRAME_UNAVAILABLE", true);
    if (!current) throw new FleetError("COORDINATION_CURRENT_FRAME_UNAVAILABLE", true);
    if (old.revision !== proposal.intent.expectedVersion || current.revision !== observation.revision)
      throw new FleetError("COORDINATION_FRAME_REVISION_MISMATCH", true);
    if (!proposal.evidenceRefs.length || proposal.evidenceRefs.some((r) => !old.sourceRefs.includes(r)))
      throw new FleetError("COORDINATION_REFERENCE_NOT_DELIVERED", true);
    if (proposal.intent.bindingId !== this.binding.id || proposal.intent.schemaId !== "pact.action.v1")
      throw new FleetError("COORDINATION_BINDING_MISMATCH", true);
    const previous = old.options.find((o) => matchesOption(o, proposal.intent.payload));
    const fresh = current.options.find((o) => matchesOption(o, proposal.intent.payload));
    // An invalid original proposal is not evidence of a changing environment.
    if (!previous || !isDeepStrictEqual(previous.expectedOutcome, proposal.expectedOutcome))
      throw new FleetError("COORDINATION_CHOICE_CHANGED", true);
    const changed = (reason: string) =>
      new ProposalRejection(
        "COORDINATION_CHOICE_CHANGED",
        "The observed choice or its evidence changed before submission. Make a new proposal from fresh evidence; do not reuse the rejected command or its expected outcome.",
        { reason },
      );
    if (old.ownerEpoch !== current.ownerEpoch || !isDeepStrictEqual(old.ownerIntent, current.ownerIntent))
      throw changed("owner_intent_changed");
    if (!fresh) throw changed("current_option_unavailable");
    if (!isDeepStrictEqual(fresh.expectedOutcome, proposal.expectedOutcome)) throw changed("expected_outcome_changed");
    const textChoice = previous.textFields?.includes("body") && fresh.textFields?.includes("body");
    if (
      !textChoice &&
      (!isDeepStrictEqual(previous.claims, proposal.claims) || !isDeepStrictEqual(fresh.claims, proposal.claims))
    )
      throw new FleetError("CLAIMS_DO_NOT_MATCH_ACTION", true);
    const intent = { ...proposal.intent, expectedVersion: observation.revision };
    let claims = proposal.claims;
    if (textChoice) {
      const { quote } = await this.quote(intent);
      if (quote.revision !== observation.revision || quote.sourceRefs.some((r) => !observation.sourceRefs.includes(r)))
        throw new FleetError("STALE_PROPOSAL", true);
      claims = coordinationClaims(quote, intent.commandId);
      // Initial text proposals have no guessed claims. Subsequent refreshes must
      // retain the exact already-admitted costs and promises.
      if (proposal.claims.length && !isDeepStrictEqual(proposal.claims, claims))
        throw new FleetError("CLAIMS_DO_NOT_MATCH_ACTION", true);
    }
    return {
      ...proposal,
      intent,
      claims,
      evidenceRefs: fresh.sourceRefs,
      evidenceFrameRef: observation.coordination!.evidenceFrameRef,
    };
  }
  async validate(proposal: Proposal, observation: Observation): Promise<ProposalValidation> {
    this.validated.delete(proposal.intent.commandId);
    const deny = (code: string) => ({ valid: false, code });
    if (proposal.intent.bindingId !== this.binding.id || proposal.intent.schemaId !== "pact.action.v1")
      return deny("BINDING_MISMATCH");
    if (proposal.intent.expectedVersion !== observation.revision) return deny("STALE_PROPOSAL");
    const options = (observation.coordination?.focuses ?? []).flatMap((f) => rows(f.observation.options));
    if (!options.some((o) => matchesOption(o as Option, proposal.intent.payload)))
      return deny("COORDINATION_ACTION_NOT_QUOTED");
    const { command, quote } = await this.quote(proposal.intent);
    if (quote.revision !== proposal.intent.expectedVersion) return deny("STALE_PROPOSAL");
    if (!isDeepStrictEqual(coordinationClaims(quote, proposal.intent.commandId), proposal.claims))
      return deny("CLAIMS_DO_NOT_MATCH_ACTION");
    this.validated.set(proposal.intent.commandId, { command, quote, digest: actionIntentDigest(proposal.intent) });
    return { valid: true, code: "NATIVE_EFFECTS_CHECKED" };
  }
  async execute(intent: ActionIntent): Promise<Data> {
    const saved = this.validated.get(intent.commandId);
    if (!saved || saved.digest !== actionIntentDigest(intent) || saved.quote.revision !== intent.expectedVersion)
      throw new FleetError("COORDINATION_VALIDATION_REQUIRED", true);
    // Drop only after dispatch returns; uncertainties retain the immutable command in the host journal.
    const guard = {
      schemaVersion: "fleet.action-effects-guard.v1" as const,
      expectedRevision: saved.quote.revision,
      expectedEffects: saved.quote,
    };
    if (!this.game.submitGuarded) throw new FleetError("ACTION_EFFECTS_PROTOCOL_REQUIRED", true);
    const result = await this.game.submitGuarded(saved.command, pactRemoteGuard(intent, guard, saved.command));
    this.validated.delete(intent.commandId);
    return result;
  }
  readonly grounding: DecisionGrounding = {
    appliesTo: (profile) => profile.id === "specialist-coordinator" && profile.version === "1",
    inputReserveBytes: 4096,
    prepare: (input, observation) => {
      const props = object(input.schema.properties);
      if (!props.proposal || !observation.coordination) return input;
      const packet = input.messages
        .map((m) => {
          try {
            return object(JSON.parse(m.content));
          } catch {
            return {};
          }
        })
        .find((m) => m.stage === "worker");
      const focus = observation.coordination.focuses.find((f) => f.id === object(packet?.focus).id);
      if (!focus) throw new FleetError("COORDINATION_FOCUS_UNAVAILABLE", true);
      const delivered = object(expandFactTables(object(packet?.focus).observation)).options;
      const choices = delivered === undefined ? rows(focus.observation.options) : rows(delivered);
      if (choices.some((o) => !rows(focus.observation.options).some((original) => isDeepStrictEqual(o, original))))
        throw new FleetError("COORDINATION_ACTION_NOT_QUOTED", true);
      const options = choices.map((o) => ({
        type: "object",
        properties: {
          intent:
            Array.isArray(o.textFields) && o.textFields.includes("body")
              ? {
                  type: "object",
                  properties: {
                    schemaId: { const: "pact.action.v1" },
                    payload: {
                      type: "object",
                      properties: {
                        kind: { const: "game.message.send" },
                        recipientKingdomId: { const: object(o.payload).recipientKingdomId },
                        body: { type: "string", minLength: 1, maxLength: 4000 },
                      },
                      required: ["kind", "recipientKingdomId", "body"],
                      additionalProperties: false,
                    },
                  },
                  required: ["schemaId", "payload"],
                  additionalProperties: false,
                }
              : { const: { schemaId: "pact.action.v1", payload: o.payload } },
          evidenceRefs: { const: focus.sourceRefs },
          expectedOutcome: { const: o.expectedOutcome ?? {} },
          claims: { const: Array.isArray(o.textFields) ? [] : o.claims },
          conflicts: { const: [] },
        },
        required: ["intent", "evidenceRefs", "expectedOutcome", "claims", "conflicts"],
        additionalProperties: false,
      }));
      return {
        ...input,
        schema: shareGenerationSchema(
          {
            ...input.schema,
            properties: { ...props, proposal: { anyOf: [{ type: "null" }, ...options] } },
            ...(options.length && props.deferral
              ? {
                  allOf: [
                    ...(Array.isArray(input.schema.allOf) ? input.schema.allOf : []),
                    {
                      anyOf: [{ properties: { proposal: { type: "object" } } }, { required: ["deferral"] }],
                    },
                  ],
                }
              : {}),
          },
          { compactNames: true, inlineSingleUse: true },
        ),
      };
    },
    validate: (decision, observation, input) => {
      const d = object(decision);
      if (d.proposal !== null) return null;
      const packet = input.messages
        .map((m) => {
          try {
            return object(JSON.parse(m.content));
          } catch {
            return {};
          }
        })
        .find((p) => p.stage === "worker");
      const focus = observation.coordination?.focuses.find((f) => f.id === object(packet?.focus).id);
      if (!rows(focus?.observation.options).length) return null;
      const deferral = object(d.deferral);
      if (
        ["different_owner_priority", "resource_reserve", "risk_review", "deliberate_pacing"].includes(
          String(deferral.reason),
        ) &&
        typeof deferral.explanation === "string" &&
        deferral.explanation.trim() &&
        deferral.explanation.length <= 240 &&
        typeof deferral.reconsiderWhen === "string" &&
        deferral.reconsiderWhen.trim() &&
        deferral.reconsiderWhen.length <= 160
      )
        return null;
      return {
        code: "PACT_ABSTENTION_REASON_REQUIRED",
        retryable: true,
        message:
          "No command was prepared or queued. This focus contains native quoted choices. Choose a useful proposal, or return proposal:null plus deferral:{reason,explanation,reconsiderWhen}; reason is different_owner_priority/resource_reserve/risk_review/deliberate_pacing. Explain the owner-goal tradeoff and when to reconsider. A quote is not a committed job; do not wait for an unsubmitted proposal to complete.",
      };
    },
  };
}
