import { expect, it } from "vitest";
import {
  type EvidenceSelection,
  type Original,
  selectNegotiationEvidence,
} from "../../src/modules/evidence/negotiation/v1.js";

const original = (id: string, kind: Original["kind"], causalKey = "contract"): Original => ({
  id,
  bindingId: "self",
  kind,
  causalKey,
  entityRefs: ["peer"],
  goalRefs: ["silver"],
  sourceRefs: [`source:${id}`],
  createdAt: "2026-10-20T00:00:00Z",
  expiresAt: "2026-11-19T00:00:00Z",
  detail: { status: id },
});
const input = (): EvidenceSelection => ({
  bindingId: "self",
  goalRefs: ["silver"],
  entityRefs: ["peer"],
  conversationRefs: [],
  now: "2026-10-21T00:00:00Z",
  maxBytes: 3000,
  originals: [
    original("promise", "promise"),
    original("default", "outcome"),
    ...Array.from({ length: 10 }, (_, i) => original(`stock${i}`, "observation", `stock${i}`)),
  ],
  interpretations: [{ id: "lesson", text: "Peer defaulted once", evidenceRefs: ["promise", "default"] }],
});
it("missed_delivery_survives_ten_stock_updates", () => {
  const r = selectNegotiationEvidence(input());
  expect(r.bundles[0].originals.map((o) => o.id)).toEqual(["promise", "default"]);
  expect(r.deliveredIds).toContain("default");
  expect(r.policyDigest).toMatch(/^[a-f0-9]{64}$/);
});
it("fulfilled_differs_from_default", () => {
  const a = input(),
    b = input();
  b.originals[1] = original("fulfilled", "outcome");
  b.interpretations = [];
  expect(selectNegotiationEvidence(a).bundles[0]).not.toEqual(selectNegotiationEvidence(b).bundles[0]);
});
it("originals_and_interpretation_fit_together", () => {
  const r = selectNegotiationEvidence(input());
  expect(r.bundles[0].interpretations[0].evidenceRefs).toEqual(["promise", "default"]);
  expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(3000);
});
it("source_expiry_removes_support and foreign evidence is inadmissible", () => {
  const x = input();
  x.originals[1].expiresAt = "2026-10-20T00:00:00Z";
  x.originals.push({ ...original("foreign", "outcome"), bindingId: "other" });
  const r = selectNegotiationEvidence(x);
  expect(r.deliveredIds).not.toContain("lesson");
  expect(r.deliveredIds).not.toContain("default");
  expect(r.omitted).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "lesson", reason: "missing_support" }),
      expect.objectContaining({ id: "foreign", reason: "foreign_binding" }),
    ]),
  );
});
it("oversize_bundle_reports_unavailable instead of splitting sources", () => {
  const x = input();
  x.originals[1].detail = { large: "x".repeat(5000) };
  x.maxBytes = 1700;
  const r = selectNegotiationEvidence(x);
  expect(r.deliveredIds).not.toContain("promise");
  expect(r.deliveredIds).not.toContain("default");
  expect(r.deliveredIds).not.toContain("lesson");
  expect(r.omitted).toContainEqual({ id: "default", reason: "bundle_unavailable" });
  expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(1700);
});
it("repeated observations deduplicate without discarding causal outcomes", () => {
  const x = input();
  x.originals.push({ ...original("new-stock", "observation", "stock0"), createdAt: "2026-10-20T12:00:00Z" });
  const r = selectNegotiationEvidence(x);
  expect(r.omitted).toContainEqual({ id: "stock0", reason: "superseded_observation" });
  expect(r.deliveredIds).toContain("default");
});
