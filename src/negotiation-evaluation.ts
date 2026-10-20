import { z } from "zod";

const id = z.string().min(1).max(200),
  source = z.string().min(1).max(8000),
  amount = z.string().regex(/^(0|[1-9][0-9]{0,29})$/),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const resources = z.object({ iron: amount, silver: amount, grain: amount }).strict();
const resource = z.enum(["iron", "silver", "grain"]);
const flow = z.object({ resource, wholePerHour: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const bond = z.object({ resource, wholeAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const NegotiationTermsSchema = z
  .object({
    aToB: flow.nullable(),
    bToA: flow.nullable(),
    aBond: bond.nullable(),
    bBond: bond.nullable(),
    durationHours: z.literal(1),
    noticeHours: z.literal(0),
  })
  .strict();
export const NegotiationEvidenceSchema = z
  .object({
    schemaVersion: z.literal("pact.negotiation-outcome.v1"),
    cellId: id,
    worldId: id,
    rulesId: z.literal("pact-s1-v1"),
    configurationDigest: digest,
    initialStateDigest: digest,
    horizonGameTimeMs: amount,
    coverage: z
      .object({ complete: z.boolean(), sourceRefs: z.array(source).max(1000), omitted: z.array(id).max(50) })
      .strict(),
    actors: z
      .array(
        z
          .object({
            actorId: id,
            counterpartyId: id,
            goalDigest: digest,
            ordinaryStart: resources,
            ordinaryFinal: resources,
          })
          .strict(),
      )
      .length(2),
    offers: z
      .array(
        z
          .object({
            id,
            version: z.number().int().positive(),
            kingdomA: id,
            kingdomB: id,
            status: z.enum(["open", "active", "withdrawn", "expired", "superseded"]),
            signedBy: z.array(id).max(2),
            terms: NegotiationTermsSchema,
            expiresGameTimeMs: amount,
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    contracts: z
      .array(
        z
          .object({
            id,
            offerId: id,
            offerVersion: z.number().int().positive(),
            kingdomA: id,
            kingdomB: id,
            status: z.enum(["active", "expired", "released", "defaulted"]),
            terms: NegotiationTermsSchema,
            startGameTimeMs: amount,
            endGameTimeMs: amount,
            flows: z
              .array(
                z
                  .object({
                    senderId: id,
                    recipientId: id,
                    resource,
                    wholePerHour: z.number().int().positive(),
                    dueUnits: amount,
                    deliveredUnits: amount,
                    overflowUnits: amount,
                    installments: z.number().int().nonnegative(),
                    failedInstallments: z.number().int().nonnegative(),
                  })
                  .strict(),
              )
              .max(2),
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    receipts: z
      .array(
        z
          .object({
            commandId: id,
            actorId: id,
            kind: id,
            code: id,
            recordVersions: z.record(z.string(), z.number().int().nonnegative()),
            sourceRefs: z.array(source).min(1).max(20),
          })
          .strict(),
      )
      .max(500),
    lifecycle: z
      .array(
        z
          .object({
            stage: z.enum([
              "opportunity",
              "exposure",
              "contact",
              "dialogue",
              "proposal",
              "signature",
              "activation",
              "delivery",
              "closure",
              "later_decision",
            ]),
            actorId: id,
            referenceId: id,
            gameTimeMs: amount,
            wallTime: z.iso.datetime(),
            sourceRefs: z.array(source).min(1).max(20),
            scriptedPrefix: z.boolean(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .superRefine((e, c) => {
    const actors = new Set(e.actors.map((a) => a.actorId));
    if (actors.size !== 2 || e.actors.some((a) => !actors.has(a.counterpartyId) || a.actorId === a.counterpartyId))
      c.addIssue({ code: "custom", message: "Actor scope mismatch" });
    for (const o of e.offers)
      if (
        !actors.has(o.kingdomA) ||
        !actors.has(o.kingdomB) ||
        o.kingdomA === o.kingdomB ||
        new Set(o.signedBy).size !== o.signedBy.length ||
        o.signedBy.some((a) => !actors.has(a))
      )
        c.addIssue({ code: "custom", message: "Offer scope mismatch" });
    for (const contract of e.contracts) {
      const offer = e.offers.find((o) => o.id === contract.offerId && o.version === contract.offerVersion);
      if (
        !offer ||
        offer.kingdomA !== contract.kingdomA ||
        offer.kingdomB !== contract.kingdomB ||
        offer.signedBy.length !== 2 ||
        JSON.stringify(offer.terms) !== JSON.stringify(contract.terms)
      )
        c.addIssue({ code: "custom", message: "Contract lacks exact mutual consent" });
      for (const f of contract.flows)
        if (
          !actors.has(f.senderId) ||
          !actors.has(f.recipientId) ||
          f.senderId === f.recipientId ||
          BigInt(f.deliveredUnits) > BigInt(f.dueUnits) ||
          BigInt(f.overflowUnits) > BigInt(f.deliveredUnits) ||
          f.failedInstallments > f.installments
        )
          c.addIssue({ code: "custom", message: "Inconsistent obligation evidence" });
    }
    if (e.receipts.some((r) => !actors.has(r.actorId)) || e.lifecycle.some((r) => !actors.has(r.actorId)))
      c.addIssue({ code: "custom", message: "Foreign actor evidence" });
  });
export type NegotiationEvidence = z.infer<typeof NegotiationEvidenceSchema>;
export function assertNegotiationEvidence(
  value: unknown,
  expected: Pick<NegotiationEvidence, "cellId" | "worldId" | "configurationDigest" | "initialStateDigest">,
): NegotiationEvidence {
  const evidence = NegotiationEvidenceSchema.parse(value);
  if (Object.entries(expected).some(([k, v]) => evidence[k as keyof typeof expected] !== v))
    throw Error("NEGOTIATION_SCOPE_MISMATCH");
  return evidence;
}
export const NegotiationEvidenceJsonSchema = z.toJSONSchema(NegotiationEvidenceSchema, { target: "draft-7" });
