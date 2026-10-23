import { expect, it } from "vitest";
import { expandFactTables } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";

const candidates = Array.from({ length: 40 }, (_, i) => ({
  kind: "native-feasibility",
  index: i,
  sourceRefs: ["owned:source"],
  ordinaryUnits: String(600000 + i),
  forecastUnits: String(600600 + i),
  allowed: false,
  ...(i % 2 ? { reason: null } : {}),
  cost: { ironUnits: "600", silverUnits: "0" },
}));
const observation = () => ({
  schemaId: "pact.observation.v1",
  revision: "native-revision",
  observedAt: "2026-10-23T00:00:00Z",
  environmentTime: { clockId: "pact.game-time-ms", value: "0" },
  sourceRefs: ["native:source"],
  payload: {
    requestedRead: {
      schemaVersion: "pact.agent-outlook.v1",
      ownerRef: "owner",
      resources: candidates.slice(0, 3),
      feasibility: { candidates, meaning: "Native predictions, never permission" },
      extra: null,
    },
  },
  continuity: {
    schemaVersion: "fleet.continuity-observation.v1",
    self: {
      capabilities: [],
      needs: { resources: candidates.slice(0, 3), feasibility: candidates },
      dependencies: { observed: candidates.slice(0, 2) },
      ownerValues: { text: "unchanged" },
    },
    facts: [],
  },
});
it("preserves every whole row, missing/null value, unit, order and source across lossless outlook projection", () => {
  const raw = observation(),
    before = structuredClone(raw),
    projected = projectPactObservation(raw as never, { id: "specialists", version: "3" });
  expect(expandFactTables(projected.payload)).toEqual(raw.payload);
  expect(expandFactTables(projected.continuity)).toEqual(raw.continuity);
  expect(Buffer.byteLength(JSON.stringify(projected))).toBeLessThan(Buffer.byteLength(JSON.stringify(raw)));
  expect(raw).toEqual(before);
  expect(projected.environmentTime).toEqual(raw.environmentTime);
  expect(projected.sourceRefs).toEqual(raw.sourceRefs);
  expect(projectPactObservation(projected, { id: "specialists", version: "3" })).toEqual(projected);
});
it("keeps v1 and v2 presentation unchanged", () => {
  const raw = observation();
  for (const version of ["1", "2"]) {
    const projected = projectPactObservation(raw as never, { id: "specialists", version });
    expect(projected.payload).toBe(raw.payload);
    expect(projected.continuity).toBe(raw.continuity);
  }
});
