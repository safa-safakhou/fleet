import { createHash } from "node:crypto";
import { FleetError } from "../../domain.js";
import {
  type EvidenceSelectionResult,
  type Interpretation,
  type Original,
  selectNegotiationEvidence,
} from "../../modules/evidence/negotiation/v1.js";

type Input = {
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
type Packet = EvidenceSelectionResult & { retrieval: { memoryCandidates: number; omittedMemoryCandidates: number } };
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
      const packet: Packet = {
        ...selectNegotiationEvidence({
          bindingId: input.scope.bindingId,
          goalRefs: input.goalRefs,
          entityRefs: input.entityRefs,
          conversationRefs: input.conversationRefs,
          originals: input.facts.map((o) =>
            o.kind === "observation" && protectedIds.has(o.id)
              ? { ...o, causalKey: `${o.causalKey}:protected:${o.id}` }
              : o,
          ),
          interpretations: chosen,
          now: input.now,
          maxBytes: input.limits.maxBytes,
          requiredIds: [...protectedIds],
        }),
        retrieval: { memoryCandidates: input.memory.length, omittedMemoryCandidates: 0 },
      };
      packet.policyDigest = createHash("sha256")
        .update(`specialist-context.v2:required-first:protected-history:bounded-interpretations:${packet.policyDigest}`)
        .digest("hex");
      for (const bundle of packet.bundles)
        bundle.originals = bundle.originals.map((o) => structuredClone(originals.get(o.id) ?? o));
      packet.candidateIds = [...input.facts, ...ranked].map((o) => o.id);
      packet.omitted.push(...removed.map((id) => ({ id, reason: "optional_interpretation_packet_limit" })));
      packet.retrieval.omittedMemoryCandidates =
        input.memory.length - input.memory.filter((m) => packet.deliveredIds.includes(m.id)).length;
      if (
        input.requiredEvidenceIds.some((id) => !packet.deliveredIds.includes(id)) ||
        Buffer.byteLength(JSON.stringify(packet)) > input.limits.maxBytes
      )
        throw new FleetError("CONTEXT_LIMIT", true);
      return packet;
    } catch (e) {
      if (!(e instanceof FleetError) || !["CONTEXT_LIMIT", "SPECIALIST_CONTEXT_INCOMPLETE"].includes(e.code)) throw e;
      const last = chosen.pop();
      if (!last) throw new FleetError("SPECIALIST_CONTEXT_INCOMPLETE", true);
      removed.push(last.id);
    }
  }
}
