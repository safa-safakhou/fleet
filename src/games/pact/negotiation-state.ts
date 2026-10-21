import { createHash } from "node:crypto";
import { type Data, FleetError, object } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";

const rows = (v: unknown): Data[] => (Array.isArray(v) ? v.map(object) : []);
const refs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
const time = (v: unknown): string | null => (typeof v !== "undefined" && /^\d+$/.test(String(v)) ? String(v) : null);
export type NegotiationState = Data & {
  offers: Data[];
  contracts: Data[];
  coverage: { complete: boolean; omitted: string[] };
};
/** Authorized facts only. The projection never chooses terms, a peer or an action. */
export function negotiationState(facts: Data): NegotiationState {
  const world = object(facts.world),
    guide = object(facts.guide),
    section = object(facts.agreementSection),
    selfId = object(world.profile).kingdomId;
  const omitted: string[] = [];
  const asOf = time(world.asOfGameTimeMs);
  const consistent = asOf !== null && (guide.asOfGameTimeMs === undefined || time(guide.asOfGameTimeMs) === asOf);
  if (!consistent) omitted.push("current_time_unavailable_or_inconsistent");
  const sourceRefs = refs(facts.sourceRefs);
  if (!sourceRefs.length) omitted.push("source_refs_unavailable");
  const page = object(section.coverage ?? guide.agreementCoverage);
  if ((page.hasMore !== false && page.complete !== true) || section.next)
    omitted.push("agreements_not_exhaustive; use scoped agreements read");
  if (!Array.isArray(facts.outstandingCommands)) omitted.push("outstanding_commands_unknown");
  const collected = new Map<string, Data>();
  // A current scoped page overrides the shorter guide summary of the same record.
  for (const raw of [
    ...rows(guide.openSupplyOffers).map((o): Data => ({ ...o, type: "SupplyOffer" })),
    ...rows(guide.activeSupplyContracts).map((o): Data => ({ ...o, type: "SupplyContract" })),
    ...rows(object(facts.socialAttention).records),
    ...rows(section.records),
  ]) {
    if (!["SupplyOffer", "SupplyContract"].includes(String(raw.type))) continue;
    const id = typeof raw.id === "string" ? raw.id : null;
    if (!id) {
      omitted.push("record_without_id");
      continue;
    }
    collected.set(`${raw.type}:${id}`, raw);
  }
  const offers: Data[] = [],
    contracts: Data[] = [];
  for (const raw of collected.values()) {
    const id = String(raw.id),
      a = raw.kingdomA === selfId,
      b = raw.kingdomB === selfId;
    // Older active summaries have only self-relative fields; retain those explicitly
    // without guessing party/bond identity or joining an unrelated offer.
    const relative =
      !a &&
      !b &&
      typeof raw.counterpartyKingdomId === "string" &&
      raw.youSend !== undefined &&
      raw.youReceive !== undefined;
    if (typeof selfId !== "string" || (!a && !b && !relative)) {
      omitted.push(`foreign:${id}`);
      continue;
    }
    const peerId = a ? raw.kingdomB : b ? raw.kingdomA : raw.counterpartyKingdomId;
    if (typeof peerId !== "string" || peerId === selfId) {
      omitted.push(`invalid_peer:${id}`);
      continue;
    }
    const terms = object(raw.terms),
      contract = raw.type === "SupplyContract";
    const version = Number.isSafeInteger(raw.version) ? raw.version : null;
    const signatures = version !== null && Array.isArray(raw.signedBy) ? refs(raw.signedBy) : null;
    const end = time(contract ? raw.endGameTimeMs : raw.expiresGameTimeMs);
    const deliveries = Array.isArray(raw.deliveries) ? structuredClone(raw.deliveries) : null;
    const status = typeof raw.status === "string" ? raw.status : null;
    const common: Data = {
      id,
      selfId,
      peerId,
      conversationId: raw.conversationId ?? null,
      kingdomA: raw.kingdomA ?? null,
      kingdomB: raw.kingdomB ?? null,
      terms: structuredClone(terms),
      youSend: a ? terms.aToB : b ? terms.bToA : raw.youSend,
      youReceive: a ? terms.bToA : b ? terms.aToB : raw.youReceive,
      yourBond: a ? terms.aBond : b ? terms.bBond : null,
      peerBond: a ? terms.bBond : b ? terms.aBond : null,
      status,
      sourceRefs: [...sourceRefs, `${raw.type}:${id}${version === null ? "" : `:v${version}`}`],
      asOfGameTimeMs: asOf,
      live:
        consistent && end !== null
          ? BigInt(end) > BigInt(asOf!) &&
            raw.expired !== true &&
            (status === null || status === (contract ? "active" : "open"))
          : null,
    };
    if (!contract)
      offers.push({
        ...common,
        version,
        selfConsent: signatures ? signatures.includes(String(selfId)) : null,
        peerConsent: signatures ? signatures.includes(peerId) : null,
        expiresGameTimeMs: end,
        deliveryEstablished: false,
      });
    else {
      const failed = deliveries?.some((d) => Number(object(d).failedInstallments) > 0);
      // Expired/closed alone never proves fulfillment. Due totals, failures and
      // terminal end time are needed for both non-null flow directions.
      const start = time(raw.startGameTimeMs);
      const expected = [
        { flow: common.youSend, direction: "sent" },
        { flow: common.youReceive, direction: "received" },
      ].filter((x) => x.flow !== null && x.flow !== undefined);
      const fullyObserved =
        deliveries !== null &&
        expected.length > 0 &&
        start !== null &&
        end !== null &&
        BigInt(end) > BigInt(start) &&
        expected.every(({ flow, direction }) =>
          deliveries.some((d) => {
            const x = object(d),
              rate = object(flow).wholePerHour;
            if (
              !Number.isSafeInteger(rate) ||
              Number(rate) <= 0 ||
              !/^\d+$/.test(String(x.dueMarked)) ||
              !/^\d+$/.test(String(x.deliveredMarked))
            )
              return false;
            const total = (BigInt(Number(rate)) * 600n * (BigInt(end) - BigInt(start))) / 3600000n;
            return (
              x.direction === direction &&
              x.resource === object(flow).resource &&
              BigInt(String(x.dueMarked)) >= total &&
              String(x.dueMarked) === String(x.deliveredMarked) &&
              Number(x.installments) > 0 &&
              Number(x.failedInstallments) === 0
            );
          }),
        );
      contracts.push({
        ...common,
        offerId: raw.offerId ?? null,
        offerVersion: raw.offerVersion ?? null,
        startGameTimeMs: time(raw.startGameTimeMs),
        endGameTimeMs: end,
        deliveries,
        closure:
          status === "defaulted" || failed
            ? "defaulted"
            : consistent && end !== null && BigInt(end) <= BigInt(asOf!) && fullyObserved
              ? "fulfilled"
              : "unknown",
        deliveryEstablished: deliveries?.some((d) => BigInt(String(object(d).deliveredMarked ?? 0)) > 0n) ?? false,
      });
    }
  }
  const base = {
    schemaVersion: "pact.negotiation-state.v1",
    selfId: selfId ?? null,
    asOfGameTimeMs: asOf,
    offers,
    contracts,
    constraints: {
      stock: world.stock ?? world.stocks ?? world.balances ?? null,
      authority: world.authority ?? null,
      mandate: guide.mandate ?? null,
      socialDelegation: guide.socialDelegation ?? null,
    },
    outstandingCommands: Array.isArray(facts.outstandingCommands) ? structuredClone(facts.outstandingCommands) : null,
    units: { stock: "internal", flow: "whole/hour", bond: "whole", internalPerWhole: 600 },
    sourceRefs,
    coverage: { complete: omitted.length === 0, omitted },
  };
  return { ...base, revision: createHash("sha256").update(JSON.stringify(base)).digest("hex") };
}
/** Whole protected records fit or disappear with an explicit unavailable ID. */
export function fitNegotiationState(input: NegotiationState, maxBytes: number) {
  const state = structuredClone(input);
  const result = () => ({ state, coverage: state.coverage });
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new FleetError("CONTEXT_LIMIT", true);
  while (Buffer.byteLength(JSON.stringify(result())) > maxBytes) {
    if (state.constraints !== null) {
      state.constraints = null;
      state.coverage.complete = false;
      state.coverage.omitted.push("constraints_unavailable; read current scoped authority/stock");
      continue;
    }
    const values = state.offers.length ? state.offers : state.contracts;
    const dropped = values.pop();
    if (!dropped) throw new FleetError("CONTEXT_LIMIT", true);
    state.coverage.complete = false;
    state.coverage.omitted.push(`unavailable:${dropped.id}; narrow scoped read required`);
  }
  return result();
}
/** Selected by a trusted engine policy port, never by model query fields. */
export function projectPactObservation(observation: Observation, policy: { id: string; version: string }): Observation {
  if (policy.id === "specialists" && policy.version === "1")
    return { ...observation, schemaId: "pact.observation.specialists.v1" };
  if (policy.id !== "negotiation" || !["1", "2"].includes(policy.version))
    throw new FleetError("UNSUPPORTED_OBSERVATION_POLICY", true);
  const state = negotiationState({ ...observation.payload, sourceRefs: observation.sourceRefs });
  return {
    ...observation,
    schemaId: `pact.observation.negotiation.v${policy.version}`,
    payload: { ...observation.payload, negotiation: state },
  };
}
