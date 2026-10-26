import { createHash } from "node:crypto";
import { FleetError } from "../../domain.js";
import { packEvidenceMetadata } from "../../evidence-metadata.js";
import {
  type EvidenceSelectionResult,
  type Interpretation,
  type Original,
  selectNegotiationEvidence,
} from "../../modules/evidence/negotiation/v1.js";

type Input = {
  compactMetadata?: boolean;
  boundedHistory?: boolean;
  scope: { bindingId: string };
  goalRefs: string[];
  entityRefs: string[];
  conversationRefs: string[];
  requiredEvidenceIds: string[];
  facts: Original[];
  memory: Interpretation[];
  now: string;
  limits: { maxBytes: number };
};
type Packet = EvidenceSelectionResult & {
  retrieval: {
    memoryCandidates: number;
    omittedMemoryCandidates: number;
    supersededObservationCandidates?: number;
    omissionExamplesComplete?: boolean;
  };
};
/** Originals remain mandatory support; optional prose cannot crowd them out. */
export function selectSpecialistContext(input: Input): Packet {
  if (input.memory.length > 256) throw new FleetError("EVIDENCE_SELECTION_LIMIT", true);
  const originals = new Map(input.facts.map((o) => [o.id, o]));
  const score = (m: Interpretation) =>
    Math.max(
      0,
      ...m.evidenceRefs.map((id) => {
        const o = originals.get(id);
        return !o
          ? 0
          : (o.kind === "outcome" ? 100 : o.kind === "promise" ? 40 : 0) +
              (o.goalRefs.some((g) => input.goalRefs.includes(g)) ? 20 : 0) +
              (input.requiredEvidenceIds.includes(id) ? 15 : 0);
      }),
    );
  const ranked = input.memory
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => score(b.memory) - score(a.memory) || b.index - a.index || a.memory.id.localeCompare(b.memory.id))
    .slice(0, 32)
    .map((x) => x.memory);
  const chosen = [...ranked],
    removed: string[] = [];
  for (;;) {
    try {
      const protectedIds = new Set([...input.requiredEvidenceIds, ...chosen.flatMap((m) => m.evidenceRefs)]);
      const admissible = (o: Original) =>
        o.bindingId === input.scope.bindingId &&
        o.sourceRefs.length > 0 &&
        Number.isFinite(Date.parse(o.expiresAt)) &&
        Date.parse(o.expiresAt) > Date.parse(input.now);
      const superseded = input.boundedHistory
        ? input.facts.filter(
            (o) =>
              o.kind === "observation" &&
              admissible(o) &&
              !protectedIds.has(o.id) &&
              input.facts.some(
                (n) =>
                  n.kind === "observation" &&
                  admissible(n) &&
                  n.causalKey === o.causalKey &&
                  (n.createdAt > o.createdAt || (n.createdAt === o.createdAt && n.id > o.id)),
              ),
          )
        : [];
      const supersededIds = new Set(superseded.map((o) => o.id));
      const facts = input.facts.filter((o) => !supersededIds.has(o.id));
      let allowance = input.limits.maxBytes;
      for (let pass = 0; pass < 12 && allowance > 0; pass++) {
        const packet: Packet = {
          ...selectNegotiationEvidence({
            bindingId: input.scope.bindingId,
            goalRefs: input.goalRefs,
            entityRefs: input.entityRefs,
            conversationRefs: input.conversationRefs,
            originals: facts.map((o) =>
              o.kind === "observation" && protectedIds.has(o.id)
                ? { ...o, causalKey: `${o.causalKey}:protected:${o.id}` }
                : o,
            ),
            interpretations: chosen,
            now: input.now,
            maxBytes: allowance,
            ...(input.compactMetadata ? { compactMetadata: true } : {}),
            requiredIds: [...protectedIds],
          }),
          retrieval: {
            memoryCandidates: input.memory.length,
            omittedMemoryCandidates: 0,
            ...(input.boundedHistory
              ? { supersededObservationCandidates: superseded.length, omissionExamplesComplete: superseded.length <= 4 }
              : {}),
          },
        };
        packet.policyDigest = createHash("sha256")
          .update(
            `specialist-context.${input.boundedHistory ? "v3:bounded-history" : "v2"}:required-first:protected-history:bounded-interpretations:${packet.policyDigest}`,
          )
          .digest("hex");
        for (const bundle of packet.bundles)
          bundle.originals = bundle.originals.map((o) => structuredClone(originals.get(o.id) ?? o));
        packet.candidateIds = [...facts, ...ranked].map((o) => o.id);
        packet.omitted.push(
          ...superseded.slice(0, 4).map((o) => ({ id: o.id, reason: "superseded_observation" })),
          ...removed.map((id) => ({ id, reason: "optional_interpretation_packet_limit" })),
        );
        packet.retrieval.omittedMemoryCandidates =
          input.memory.length - input.memory.filter((m) => packet.deliveredIds.includes(m.id)).length;
        if (input.requiredEvidenceIds.some((id) => !packet.deliveredIds.includes(id)))
          throw new FleetError("CONTEXT_LIMIT", true);
        const bytes = Buffer.byteLength(JSON.stringify(input.compactMetadata ? packEvidenceMetadata(packet) : packet));
        if (bytes <= input.limits.maxBytes) return packet;
        // Retry whole-bundle selection with the measured wrapper cost charged, never truncate evidence.
        allowance -= Math.max(32, bytes - input.limits.maxBytes + 16);
      }
      throw new FleetError("CONTEXT_LIMIT", true);
    } catch (e) {
      if (!(e instanceof FleetError) || !["CONTEXT_LIMIT", "SPECIALIST_CONTEXT_INCOMPLETE"].includes(e.code)) throw e;
      const last = chosen.pop();
      if (!last) throw new FleetError("SPECIALIST_CONTEXT_INCOMPLETE", true);
      removed.push(last.id);
    }
  }
}
