import { type Data, object } from "../../domain.js";
export function attentionRecords(facts: Data): Data[] {
  const v = object(facts.socialAttention);
  return Array.isArray(v.records) ? v.records.map(object) : [];
}
export function deliveredSocialSummary(context: Data) {
  const records = attentionRecords({ socialAttention: object(context.environment).socialAttention });
  const delivered = records.map((r) => ({
    id: r.id,
    type: r.type,
    version: r.version,
    status: r.status,
    direction: r.direction ?? r.yourRole,
    termsDelivered:
      ["SupplyOffer", "GarrisonOffer", "SupplyContract", "GarrisonContract"].includes(String(r.type)) &&
      (String(r.type).startsWith("Supply")
        ? ["aToB", "bToA", "aBond", "bBond", "durationHours", "noticeHours"]
        : ["units", "durationHours", "lenderBond", "hostBond"]
      ).every((k) => Object.hasOwn(object(r.terms), k)),
    reason: r.reason,
  }));
  return {
    records: delivered,
    coverage: object(object(context.environment).socialAttention).coverage,
    meaning:
      "Records present in the final fitted model input; termsDelivered means visible whole record terms, never acceptance, activation, fulfilment or economic benefit.",
  };
}
export function socialSignals(facts: Data) {
  const signals: { kind: string; referenceId: string; value: string | number | boolean; asOfGameTimeMs?: number }[] =
      [],
    byId = new Map<string, { record: Data; time: number }>();
  const add = (values: unknown, time: unknown) => {
    if (Array.isArray(values))
      for (const raw of values) {
        const record = object(raw);
        if (typeof record.id !== "string") continue;
        const at = Number(time ?? 0),
          prior = byId.get(record.id);
        if (!prior || at >= prior.time) byId.set(record.id, { record, time: at });
      }
  };
  const consequences = object(object(facts.world).consequences);
  add(
    Array.isArray(consequences.supplyContracts)
      ? consequences.supplyContracts.map((r) => ({ ...object(r), type: "SupplyContract" }))
      : [],
    consequences.asOfGameTimeMs ?? object(facts.world).asOfGameTimeMs,
  );
  add(attentionRecords(facts), object(facts.socialAttention).asOfGameTimeMs);
  add(object(facts.agreementSection).records, object(facts.agreementSection).asOfGameTimeMs);
  for (const { record: r, time } of byId.values()) {
    if (typeof r.id !== "string" || typeof r.status !== "string") continue;
    const offer = String(r.type).endsWith("Offer"),
      request = r.type === "ContactRequest";
    signals.push({
      kind: request ? "contact_request_status" : offer ? "offer_status" : "agreement_status",
      referenceId: r.id,
      value: r.status,
      asOfGameTimeMs: time,
    });
    if (offer && r.status === "open")
      signals.push({ kind: "offer_activated", referenceId: r.id, value: false, asOfGameTimeMs: time });
    if (!offer && !request && typeof r.offerId === "string")
      signals.push({ kind: "offer_activated", referenceId: r.offerId, value: true, asOfGameTimeMs: time });
    if (typeof r.version === "number")
      signals.push({ kind: "offer_version", referenceId: r.id, value: r.version, asOfGameTimeMs: time });
    if (Array.isArray(r.deliveries))
      for (const d of r.deliveries.map(object)) {
        const valid = typeof d.deliveredMarked === "string" && /^\d+$/.test(d.deliveredMarked),
          amount = valid ? Number(d.deliveredMarked) : NaN;
        if (d.direction === "received" && Number.isSafeInteger(amount) && amount >= 0)
          signals.push({
            kind: "supply_received_units",
            referenceId: `${r.id}:${d.resource}`,
            value: amount,
            asOfGameTimeMs: time,
          });
      }
  }
  const latest = new Map<string, (typeof signals)[number]>();
  for (const signal of signals) {
    const key = `${signal.kind}:${signal.referenceId}`,
      prior = latest.get(key);
    if (
      !prior ||
      Number(signal.asOfGameTimeMs) > Number(prior.asOfGameTimeMs) ||
      (signal.asOfGameTimeMs === prior.asOfGameTimeMs && signal.kind === "offer_activated" && signal.value === true)
    )
      latest.set(key, signal);
  }
  return [...latest.values()];
}

export function applySocialAttention(facts: Data, result: Data) {
  const guide = object(facts.guide),
    incoming = Array.isArray(result.records) ? result.records.map(object) : [];
  const merge = (old: unknown, type: string) => {
    const combined = new Map<string, Data>(
      (Array.isArray(old) ? old.map(object) : [])
        .filter((r) => typeof r.id === "string")
        .map((r) => [r.id as string, r]),
    );
    for (const r of incoming.filter((r) => r.type === type && typeof r.id === "string"))
      combined.set(r.id as string, {
        ...r,
        kingdomId: r.counterpartyKingdomId,
        reference: {
          type: r.type,
          id: r.id,
          ownerKingdomId: result.ownerKingdomId,
          version: r.version,
          status: r.status,
          direction: r.direction,
          expiresGameTimeMs: r.expiresGameTimeMs,
          asOfGameTimeMs: result.asOfGameTimeMs,
          ...(type === "ContactRequest" ? { delegationVersion: object(result.socialDelegation).version } : {}),
        },
      });
    return [...combined.values()];
  };
  facts.socialAttention = result;
  facts.guide = {
    ...guide,
    contactRequests: merge(guide.contactRequests, "ContactRequest"),
    openSupplyOffers: merge(guide.openSupplyOffers, "SupplyOffer"),
    ...(result.socialDelegation ? { socialDelegation: result.socialDelegation } : {}),
  };
}
