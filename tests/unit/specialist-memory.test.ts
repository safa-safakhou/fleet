import { expect, it } from "vitest";
import { selectSpecialistContext } from "../../src/engines/autonomous-specialists/memory.js";
import type { Original } from "../../src/modules/evidence/negotiation/v1.js";

const now = "2026-10-11T12:00:00Z";
const fact = (id: string, kind: Original["kind"], causalKey = "supply:1"): Original => ({
  id,
  bindingId: "binding:1",
  kind,
  causalKey,
  sourceRefs: [`source:${id}`],
  entityRefs: ["peer:1"],
  goalRefs: ["goal:1"],
  createdAt: "2026-10-11T11:00:00Z",
  expiresAt: "2026-11-10T11:00:00Z",
  detail: { status: kind === "outcome" ? "defaulted" : "promised" },
});
it("protects the original failed-delivery chain and interpretation across repeated stock observations", () => {
  const facts = [
    fact("promise", "promise"),
    fact("default", "outcome"),
    ...Array.from({ length: 30 }, (_, i) => ({
      ...fact(`stock:${i}`, "observation", "stock"),
      createdAt: `2026-10-11T11:${String(i).padStart(2, "0")}:00Z`,
    })),
  ];
  const packet = selectSpecialistContext({
    scope: { bindingId: "binding:1" },
    goalRefs: ["goal:1"],
    entityRefs: ["peer:1"],
    conversationRefs: [],
    requiredEvidenceIds: ["promise", "default"],
    facts,
    memory: [{ id: "belief", text: "The prior promised delivery failed", evidenceRefs: ["promise", "default"] }],
    now,
    limits: { maxBytes: 6000 },
  });
  expect(packet.deliveredIds).toEqual(expect.arrayContaining(["promise", "default", "belief"]));
  expect(packet.bundles.find((b) => b.id === "supply:1")?.originals.map((o) => o.kind)).toEqual(["promise", "outcome"]);
  expect(packet.omitted.some((o) => o.reason === "superseded_observation")).toBe(true);
});
it("never delivers an interpretation whose original support expired or belongs to another binding", () => {
  const packet = selectSpecialistContext({
    scope: { bindingId: "binding:1" },
    goalRefs: [],
    entityRefs: [],
    conversationRefs: [],
    requiredEvidenceIds: [],
    facts: [
      { ...fact("expired", "outcome"), expiresAt: "2026-10-01T00:00:00Z" },
      { ...fact("foreign", "outcome"), bindingId: "other" },
    ],
    memory: [{ id: "unsupported", text: "Do not reconstruct private history", evidenceRefs: ["expired"] }],
    now,
    limits: { maxBytes: 3000 },
  });
  expect(packet.deliveredIds).toEqual([]);
  expect(packet.omitted.map((o) => o.reason)).toEqual(
    expect.arrayContaining(["source_expired", "foreign_binding", "missing_support"]),
  );
});
it("fails before inference when essential evidence cannot fit or is unavailable", () => {
  const input = {
    scope: { bindingId: "binding:1" },
    goalRefs: ["goal:1"],
    entityRefs: ["peer:1"],
    conversationRefs: [],
    requiredEvidenceIds: ["default"],
    facts: [fact("default", "outcome")],
    memory: [],
    now,
    limits: { maxBytes: 100 },
  };
  expect(() => selectSpecialistContext(input)).toThrow("SPECIALIST_CONTEXT_INCOMPLETE");
  expect(() => selectSpecialistContext({ ...input, facts: [], limits: { maxBytes: 3000 } })).toThrow(
    "SPECIALIST_CONTEXT_INCOMPLETE",
  );
});
it("retains a historical observation that still supports an active goal beside a newer observation", () => {
  const old = fact("old-stock", "observation", "stock"),
    latest = { ...fact("new-stock", "observation", "stock"), createdAt: "2026-10-11T11:30:00Z" };
  const packet = selectSpecialistContext({
    scope: { bindingId: "binding:1" },
    goalRefs: ["goal:1"],
    entityRefs: [],
    conversationRefs: [],
    requiredEvidenceIds: [old.id],
    facts: [old, latest],
    memory: [],
    now,
    limits: { maxBytes: 5000 },
  });
  expect(packet.deliveredIds).toEqual(expect.arrayContaining([old.id, latest.id]));
  expect(packet.bundles.flatMap((b) => b.originals).find((o) => o.id === old.id)?.causalKey).toBe("stock");
});
it("bounds a growing interpretation library without losing its required factual support", () => {
  const original = fact("required", "observation", "goal-start");
  const packet = selectSpecialistContext({
    scope: { bindingId: "binding:1" },
    goalRefs: ["goal:1"],
    entityRefs: [],
    conversationRefs: [],
    requiredEvidenceIds: [original.id],
    facts: [original],
    memory: Array.from({ length: 40 }, (_, i) => ({
      id: `memory:${i}`,
      text: "x".repeat(1000),
      evidenceRefs: [original.id],
    })),
    now,
    limits: { maxBytes: 6000 },
  });
  expect(packet.deliveredIds).toContain(original.id);
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(6000);
  expect(packet.retrieval.omittedMemoryCandidates).toBeGreaterThan(0);
});

it("reserves whole required historical evidence before optional high-score outcomes", () => {
  const required = { ...fact("required-history", "observation", "goal-support"), detail: { whole: "r".repeat(1800) } };
  const optional = {
    ...fact("optional-outcome", "outcome", "unrelated-later-result"),
    detail: { whole: "o".repeat(1800) },
  };
  const before = structuredClone([required, optional]);
  const packet = selectSpecialistContext({
    scope: { bindingId: "binding:1" },
    goalRefs: ["goal:1"],
    entityRefs: [],
    conversationRefs: [],
    requiredEvidenceIds: [required.id],
    facts: [required, optional],
    memory: [],
    now,
    limits: { maxBytes: 3000 },
  });
  expect(packet.deliveredIds).toContain(required.id);
  expect(packet.deliveredIds).not.toContain(optional.id);
  expect(packet.bundles.flatMap((b) => b.originals).find((o) => o.id === required.id)?.detail).toEqual(required.detail);
  expect(packet.omitted).toContainEqual({ id: optional.id, reason: "bundle_unavailable" });
  expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(3000);
  expect([required, optional]).toEqual(before);
});
