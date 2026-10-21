import { expect, it } from "vitest";
import { assertNegotiationEvidence, NegotiationEvidenceSchema } from "../../src/negotiation-evaluation.js";
import { designDigest, negotiationPlan } from "../../src/negotiation-plan.js";

const selection = {
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  selectedProfile: { id: "reactive-cognition", version: "2" },
};
it("freezes the exact cells and finite shared ceilings for each unapproved stage", () => {
  for (const [stage, count, calls, tokens] of [
    ["E1", 2, 144, 5760000],
    ["E2", 12, 672, 26880000],
    ["E3", 35, 1230, 49200000],
    ["E4", 2, 144, 5760000],
  ] as const) {
    const cells = negotiationPlan(stage, selection);
    expect(cells).toHaveLength(count);
    expect(cells.reduce((n, c) => n + c.limits.callsPerWorld, 0)).toBe(calls);
    expect(cells.reduce((n, c) => n + c.limits.reservedTokensPerWorld, 0)).toBe(tokens);
    expect(new Set(cells.map((c) => c.id)).size).toBe(count);
    expect(cells.every((c) => c.realProviderAuthorized === false)).toBe(true);
    expect(cells.every((c) => c.limits.callsPerWorld === 2 * c.limits.turnsPerActor * 3)).toBe(true);
  }
});
it("keeps held-out rotations and exact profile versions separate", () => {
  const development = negotiationPlan("E2", selection),
    held = negotiationPlan("E3", selection),
    native = negotiationPlan("E4", selection);
  expect(new Set(development.map((c) => c.profile.version))).toEqual(new Set(["1", "2"]));
  expect(development.every((c) => [11, 29].includes(c.seed))).toBe(true);
  expect(held.every((c) => [47, 83].includes(c.seed) && c.profile.version === "2")).toBe(true);
  expect(held.filter((c) => c.family === "C05")).toHaveLength(10);
  expect(native.map((c) => c.rolesReversed)).toEqual([false, true]);
  expect(native.every((c) => c.clockMode === "native")).toBe(true);
  expect(new Set([...development, ...held, ...native].map((c) => c.id)).size).toBe(49);
});
it("rejects extra limits or unregistered versions rather than accepting changed experiments", () => {
  expect(() => negotiationPlan("E1", { ...selection, limits: { callsPerWorld: 999 } })).toThrow();
  expect(() =>
    negotiationPlan("E3", { ...selection, selectedProfile: { id: "reactive-cognition", version: "99" } }),
  ).toThrow();
  expect(() => negotiationPlan("E3", { ...selection, modelDigest: "missing" })).toThrow();
  expect(designDigest({ a: 1, b: 2 })).toBe(designDigest({ b: 2, a: 1 }));
  expect(designDigest({ a: 2, b: 2 })).not.toBe(designDigest({ a: 1, b: 2 }));
});
const evidence = () => ({
  schemaVersion: "pact.negotiation-outcome.v1",
  cellId: "cell:1",
  worldId: "world:1",
  rulesId: "pact-s1-v1",
  configurationDigest: "a".repeat(64),
  initialStateDigest: "b".repeat(64),
  horizonGameTimeMs: "3660000",
  coverage: { complete: true, sourceRefs: ["source:1"], omitted: [] },
  actors: [
    {
      actorId: "A",
      counterpartyId: "B",
      goalDigest: "c".repeat(64),
      ordinaryStart: { iron: "360000", silver: "0", grain: "0" },
      ordinaryFinal: { iron: "360000", silver: "6700", grain: "0" },
    },
    {
      actorId: "B",
      counterpartyId: "A",
      goalDigest: "d".repeat(64),
      ordinaryStart: { iron: "0", silver: "360000", grain: "0" },
      ordinaryFinal: { iron: "13400", silver: "360000", grain: "0" },
    },
  ],
  offers: [],
  contracts: [],
  receipts: [],
  lifecycle: [],
});
function firstActor(e: ReturnType<typeof evidence>) {
  const actor = e.actors[0];
  if (!actor) throw Error("MISSING_ACTOR");
  return actor;
}
it("accepts exact amounts and rejects private text, unsafe quantities and inconsistent scope", () => {
  const good = evidence();
  expect(NegotiationEvidenceSchema.safeParse(good).success).toBe(true);
  expect(NegotiationEvidenceSchema.safeParse({ ...good, privateMessages: ["secret"] }).success).toBe(false);
  const bad = evidence();
  firstActor(bad).ordinaryFinal.iron = "-1";
  expect(NegotiationEvidenceSchema.safeParse(bad).success).toBe(false);
  const numeric = evidence();
  Object.assign(firstActor(numeric).ordinaryFinal, { iron: 1200 });
  expect(NegotiationEvidenceSchema.safeParse(numeric).success).toBe(false);
  const expected = {
    cellId: "cell:1",
    worldId: "world:1",
    configurationDigest: "a".repeat(64),
    initialStateDigest: "b".repeat(64),
  };
  expect(assertNegotiationEvidence(good, expected).worldId).toBe("world:1");
  expect(() => assertNegotiationEvidence(good, { ...expected, worldId: "foreign" })).toThrow(
    "NEGOTIATION_SCOPE_MISMATCH",
  );
  const foreign = evidence();
  firstActor(foreign).counterpartyId = "outsider";
  expect(NegotiationEvidenceSchema.safeParse(foreign).success).toBe(false);
});

it("rejects contract terms that differ from the mutually signed exact version", () => {
  const terms = {
    aToB: { resource: "iron", wholePerHour: 2 },
    bToA: null,
    aBond: null,
    bBond: null,
    durationHours: 1,
    noticeHours: 0,
  };
  const offer = {
    id: "offer:1",
    version: 2,
    kingdomA: "A",
    kingdomB: "B",
    status: "active",
    signedBy: ["A", "B"],
    terms,
    expiresGameTimeMs: "3600000",
    sourceRefs: ["offer:source"],
  };
  const contract = {
    id: "contract:1",
    offerId: "offer:1",
    offerVersion: 2,
    kingdomA: "A",
    kingdomB: "B",
    status: "expired",
    terms,
    startGameTimeMs: "60000",
    endGameTimeMs: "3660000",
    flows: [
      {
        senderId: "A",
        recipientId: "B",
        resource: "iron",
        wholePerHour: 2,
        dueUnits: "1200",
        deliveredUnits: "1200",
        overflowUnits: "0",
        installments: 60,
        failedInstallments: 0,
      },
    ],
    sourceRefs: ["contract:source"],
  };
  const good = { ...evidence(), offers: [offer], contracts: [contract] };
  expect(NegotiationEvidenceSchema.safeParse(good).success).toBe(true);
  const bad = structuredClone(good);
  const c = bad.contracts[0];
  if (!c) throw Error("MISSING_CONTRACT");
  c.terms = { ...terms, aToB: { resource: "iron", wholePerHour: 3 } };
  expect(NegotiationEvidenceSchema.safeParse(bad).success).toBe(false);
});
