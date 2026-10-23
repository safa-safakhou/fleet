import { createHash } from "node:crypto";
import type { Data } from "../../../domain.js";
import { FleetError } from "../../../domain.js";
export type Original = {
  id: string;
  bindingId: string;
  kind: "promise" | "outcome" | "observation";
  entityRefs: string[];
  goalRefs: string[];
  conversationId?: string;
  causalKey: string;
  sourceRefs: string[];
  createdAt: string;
  expiresAt: string;
  detail: Data;
};
export type Interpretation = { id: string; text: string; evidenceRefs: string[] };
export type EvidenceSelection = {
  bindingId: string;
  goalRefs: string[];
  entityRefs: string[];
  conversationRefs: string[];
  originals: Original[];
  interpretations: Interpretation[];
  now: string;
  maxBytes: number;
  requiredIds?: string[];
};
export type EvidenceSelectionResult = {
  policyDigest: string;
  bundles: { id: string; originals: Original[]; interpretations: Interpretation[] }[];
  candidateIds: string[];
  selectedIds: string[];
  deliveredIds: string[];
  omitted: { id: string; reason: string }[];
};
const policy =
  "negotiation-evidence.v1:scope-expiry;causal-bundles;outcome100,goal20,peer10,conversation10;whole-fit;stable-id";
export const negotiationEvidencePolicyDigest = createHash("sha256").update(policy).digest("hex");
export const requiredNegotiationEvidencePolicyDigest = createHash("sha256")
  .update(`${policy}:required-bundles-first`)
  .digest("hex");
export function selectNegotiationEvidence(input: EvidenceSelection): EvidenceSelectionResult {
  const omitted: EvidenceSelectionResult["omitted"] = [],
    admissible = new Map<string, Original>();
  if (input.originals.length > 100 || input.interpretations.length > 32 || !Number.isFinite(Date.parse(input.now)))
    throw new FleetError("EVIDENCE_SELECTION_LIMIT", true);
  for (const o of input.originals) {
    const reason =
      o.bindingId !== input.bindingId
        ? "foreign_binding"
        : !Number.isFinite(Date.parse(o.expiresAt)) || Date.parse(o.expiresAt) <= Date.parse(input.now)
          ? "source_expired"
          : !o.sourceRefs.length
            ? "missing_original_source"
            : null;
    if (reason) {
      omitted.push({ id: o.id, reason });
      continue;
    }
    if (admissible.has(o.id)) throw new FleetError("DUPLICATE_EVIDENCE", true);
    admissible.set(o.id, o);
  }
  for (const o of [...admissible.values()])
    if (
      o.kind === "observation" &&
      [...admissible.values()].some(
        (n) =>
          n.kind === "observation" &&
          n.causalKey === o.causalKey &&
          (n.createdAt > o.createdAt || (n.createdAt === o.createdAt && n.id > o.id)),
      )
    ) {
      admissible.delete(o.id);
      omitted.push({ id: o.id, reason: "superseded_observation" });
    }
  const groups = new Map<string, { id: string; originals: Original[]; interpretations: Interpretation[] }>();
  for (const o of admissible.values()) {
    const group = groups.get(o.causalKey) ?? { id: o.causalKey, originals: [], interpretations: [] };
    group.originals.push(o);
    groups.set(o.causalKey, group);
  }
  for (const i of input.interpretations) {
    if (!i.evidenceRefs.length || i.evidenceRefs.some((id) => !admissible.has(id))) {
      omitted.push({ id: i.id, reason: "missing_support" });
      continue;
    }
    const keys = [...new Set(i.evidenceRefs.map((id) => admissible.get(id)!.causalKey))];
    const key = keys.sort()[0],
      merged = groups.get(key)!;
    for (const other of keys.slice(1)) {
      const g = groups.get(other);
      if (g) {
        merged.originals.push(...g.originals);
        merged.interpretations.push(...g.interpretations);
        groups.delete(other);
        for (const o of g.originals) admissible.set(o.id, { ...o, causalKey: key });
      }
    }
    merged.interpretations.push(i);
  }
  const overlap = (a: string[], b: string[]) => a.some((v) => b.includes(v));
  const score = (g: { originals: Original[] }) =>
    g.originals.reduce(
      (best, o) =>
        Math.max(
          best,
          (o.kind === "outcome" ? 100 : o.kind === "promise" ? 40 : 0) +
            (overlap(o.goalRefs, input.goalRefs) ? 20 : 0) +
            (overlap(o.entityRefs, input.entityRefs) ? 10 : 0) +
            (o.conversationId && input.conversationRefs.includes(o.conversationId) ? 10 : 0),
        ),
      0,
    );
  const required = new Set(input.requiredIds ?? []);
  const essential = (g: { originals: Original[] }) => Number(g.originals.some((o) => required.has(o.id)));
  const candidates = [...groups.values()].sort(
    (a, b) => essential(b) - essential(a) || score(b) - score(a) || a.id.localeCompare(b.id),
  );
  const result: EvidenceSelectionResult = {
    policyDigest:
      input.requiredIds === undefined ? negotiationEvidencePolicyDigest : requiredNegotiationEvidencePolicyDigest,
    bundles: [],
    candidateIds: [...input.originals, ...input.interpretations].map((o) => o.id),
    selectedIds: [],
    deliveredIds: [],
    omitted,
  };
  for (const g of candidates) {
    g.originals.sort(
      (a, b) =>
        (a.kind === "promise" ? -1 : 1) - (b.kind === "promise" ? -1 : 1) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    const ids = [...g.originals, ...g.interpretations].map((o) => o.id);
    result.bundles.push(g);
    result.selectedIds.push(...ids);
    result.deliveredIds.push(...ids);
    if (Buffer.byteLength(JSON.stringify(result)) > input.maxBytes) {
      result.bundles.pop();
      result.selectedIds.splice(-ids.length);
      result.deliveredIds.splice(-ids.length);
      result.omitted.push(...ids.map((id) => ({ id, reason: "bundle_unavailable" })));
    }
  }
  // Omission metadata is protected too. If even it cannot fit, fail before a call.
  while (Buffer.byteLength(JSON.stringify(result)) > input.maxBytes && result.bundles.length) {
    const g = result.bundles.pop()!;
    const ids = [...g.originals, ...g.interpretations].map((o) => o.id);
    result.selectedIds = result.selectedIds.filter((id) => !ids.includes(id));
    result.deliveredIds = result.deliveredIds.filter((id) => !ids.includes(id));
    result.omitted.push(...ids.map((id) => ({ id, reason: "bundle_unavailable" })));
  }
  if (Buffer.byteLength(JSON.stringify(result)) > input.maxBytes) throw new FleetError("CONTEXT_LIMIT", true);
  return structuredClone(result);
}
