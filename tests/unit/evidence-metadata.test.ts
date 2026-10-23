import { expect, it } from "vitest";
import { packEvidenceMetadata, unpackEvidenceMetadata } from "../../src/evidence-metadata.js";
import { expandFactTables } from "../../src/fact-table.js";

it("round trips every metadata ID, order, duplicate and reason while leaving original bodies untouched", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `synthetic-long-id-${i}-${"x".repeat(30)}`);
  const value = {
    policyDigest: "same",
    bundles: [
      {
        originals: [
          { id: ids[0], detail: { nullable: null, missing: undefined, literal: "candidateIds", sourceRefs: ids } },
        ],
      },
    ],
    candidateIds: [...ids, ids[0]],
    selectedIds: [ids[1], ids[0]],
    deliveredIds: [ids[0], ids[1]],
    omitted: ids.slice(2).map((id, i) => ({ id, reason: i % 2 ? "expired" : "bundle_unavailable" })),
  };
  const before = structuredClone(value),
    wire = packEvidenceMetadata(value);
  expect(wire.evidenceMetadata).toBeDefined();
  expect(unpackEvidenceMetadata(wire)).toEqual(value);
  expect(expandFactTables(wire)).toEqual(value);
  expect(value).toEqual(before);
  expect(wire.bundles).toBe(value.bundles);
  expect(Buffer.byteLength(JSON.stringify(wire))).toBeLessThan(Buffer.byteLength(JSON.stringify(value)));
});
it("leaves unsupported structures and invalid dictionary references unchanged", () => {
  const raw = {
    candidateIds: ["x"],
    selectedIds: [],
    deliveredIds: [],
    omitted: [{ id: "x", reason: "why", extra: null }],
  };
  expect(packEvidenceMetadata(raw)).toBe(raw);
  const invalid = {
    evidenceMetadata: {
      format: "fleet.evidence-ids.v1",
      ids: ["source"],
      candidate: [0],
      selected: [1],
      delivered: [],
      omitted: [],
    },
  };
  expect(unpackEvidenceMetadata(invalid)).toBe(invalid);
  const extra = { ...invalid, evidenceMetadata: { ...invalid.evidenceMetadata, selected: [], extra: "literal" } };
  expect(unpackEvidenceMetadata(extra)).toBe(extra);
  const collision = { ...raw, evidenceMetadata: { literal: true } };
  expect(packEvidenceMetadata(collision)).toBe(collision);
});
