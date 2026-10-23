import { expect, it } from "vitest";
import { expandFactTables } from "../../src/fact-table.js";
import { projectPactObservation } from "../../src/games/pact/negotiation-state.js";

const owner = "123e4567-e89b-42d3-a456-426614174000";
const answer = () => ({
  schemaVersion: "pact.world.owner.v1",
  asOfGameTimeMs: 0,
  profile: { kingdomId: owner },
  balances: Object.fromEntries(
    ["iron", "silver", "grain"].map((r, i) => [
      r,
      {
        ordinaryUnits: String(i * 600),
        foundingAllowanceUnits: "0",
        lockedUnits: "0",
        capacityUnits: "360000",
        facts: { ordinaryWhole: String(i), rates: { net: { perHourWhole: "10" } } },
        version: "1",
      },
    ]),
  ),
  buildings: [
    { kind: "hall", level: 1 },
    { kind: "farm", level: 1 },
  ],
  builders: [
    { slot: 1, state: null, kind: null },
    { slot: 2, state: null, kind: null },
  ],
  unitReferences: {
    units: Array.from({ length: 8 }, (_, i) => ({
      id: `unit-${i}`,
      type: "Unit",
      ownerKingdomId: owner,
      hostKingdomId: owner,
      asOfGameTimeMs: 0,
      unitType: "spearman",
      placement: "home",
      homeGuard: true,
      battleLocked: false,
      scoutEligible: false,
      ...(i % 2 ? { optional: null } : {}),
    })),
    hasMore: false,
    scoutTroopsRequired: 2,
  },
  authority: {
    allowedActions: ["world.read"],
    resources: Object.fromEntries(
      ["iron", "silver", "grain"].map((r) => [
        r,
        { headroomUnits: "600000", ceilingUnits: "600000", releaseSchedule: [], reservations: [] },
      ]),
    ),
  },
  forecast: {
    throughGameTimeMs: 3600000,
    harvestPercentByMinute: Array(60).fill(100),
    expected: { silver: { ordinaryUnits: "6000" } },
    assumedDeliveries: [],
  },
  consequences: { contacts: [], builds: [], supplyContracts: [] },
  extra: null,
});
const observation = (requestedRead: unknown) => ({
  schemaId: "pact.observation.v1",
  revision: "native",
  observedAt: "2026-10-23T00:00:00Z",
  environmentTime: { clockId: "pact.game-time-ms", value: "0" },
  sourceRefs: ["synthetic:world"],
  payload: { requestedRead },
});
it("losslessly tables whole native world read answers without changing units, provenance, order, missing/null or forecasts", () => {
  const raw = observation(answer()),
    before = structuredClone(raw),
    p = projectPactObservation(raw as never, { id: "specialists", version: "5" });
  expect(expandFactTables(p.payload)).toEqual(raw.payload);
  expect(p.environmentTime).toEqual(raw.environmentTime);
  expect(p.sourceRefs).toEqual(raw.sourceRefs);
  expect(raw).toEqual(before);
  expect(Buffer.byteLength(JSON.stringify(p))).toBeLessThan(Buffer.byteLength(JSON.stringify(raw)) * 0.8);
  expect(projectPactObservation(p, { id: "specialists", version: "5" })).toEqual(p);
});
it("keeps previous views and non-world native answers unchanged", () => {
  const raw = observation(answer());
  for (const version of ["1", "2", "3", "4"]) {
    expect(projectPactObservation(raw as never, { id: "specialists", version }).payload.requestedRead).toBe(
      raw.payload.requestedRead,
    );
  }
  for (const a of [{ schemaVersion: "other", rows: [] }, null, "literal"]) {
    const raw = observation(a);
    expect(projectPactObservation(raw as never, { id: "specialists", version: "5" }).payload.requestedRead).toBe(a);
  }
});
