import design from "../../../src/negotiation/design.json" with { type: "json" };
import type { NegotiationClaimReviews, NegotiationEvidence } from "../../../src/negotiation-evaluation.js";
import { designDigest, negotiationPlan } from "../../../src/negotiation-plan.js";
export const selections = {
  sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
  modelDigest: "c".repeat(64),
  policyDigest: "d".repeat(64),
  selectedProfile: { id: "reactive-cognition", version: "2" },
} as const;
export function evidenceFixture(family = "C01", variant = "default") {
  const cell = negotiationPlan("E3", selections).find((c) => c.family === family && c.variant === variant)!;
  const familyDesign = design.families.find((f) => f.id === family)!;
  const start = { iron: "360000", silver: "0", grain: "0" },
    other = { iron: "0", silver: "360000", grain: "0" };
  const terms = {
    aToB: { resource: "iron" as const, wholePerHour: 2 },
    bToA: { resource: "silver" as const, wholePerHour: 1 },
    aBond: null,
    bBond: null,
    durationHours: 1 as const,
    noticeHours: 0 as const,
  };
  const actors = [
    {
      actorId: "A",
      counterpartyId: "B",
      goalDigest: designDigest(familyDesign.initialState.goals.A),
      ordinaryStart: start,
      ordinaryFinal: { ...start, silver: "600" },
    },
    {
      actorId: "B",
      counterpartyId: "A",
      goalDigest: designDigest(familyDesign.initialState.goals.B),
      ordinaryStart: other,
      ordinaryFinal: { ...other, iron: "1200" },
    },
  ];
  const evidence: NegotiationEvidence = {
    schemaVersion: "pact.negotiation-outcome.v1",
    cellId: cell.id,
    worldId: `world:${cell.id}`,
    rulesId: "pact-s1-v1",
    configurationDigest: cell.configurationDigest,
    initialStateDigest: cell.initialStateDigest,
    horizonGameTimeMs: "10800000",
    coverage: { complete: true, sourceRefs: ["snapshot:final"], omitted: [] },
    actors,
    offers: [
      {
        id: "offer",
        kingdomA: "A",
        kingdomB: "B",
        version: 2,
        status: "active",
        signedBy: ["A", "B"],
        terms,
        expiresGameTimeMs: "10000000",
        sourceRefs: ["offer:2"],
      },
    ],
    contracts: [
      {
        id: "contract",
        offerId: "offer",
        offerVersion: 2,
        kingdomA: "A",
        kingdomB: "B",
        status: "expired",
        terms,
        startGameTimeMs: "0",
        endGameTimeMs: "3600000",
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
          {
            senderId: "B",
            recipientId: "A",
            resource: "silver",
            wholePerHour: 1,
            dueUnits: "600",
            deliveredUnits: "600",
            overflowUnits: "0",
            installments: 60,
            failedInstallments: 0,
          },
        ],
        sourceRefs: ["contract:final"],
      },
    ],
    receipts: [],
    lifecycle: [
      ...(["contact", "dialogue", "proposal", "signature", "activation", "delivery", "closure"] as const).flatMap(
        (stage, i) =>
          ["A", "B"].map((actorId) => ({
            stage,
            actorId,
            referenceId: "contract",
            gameTimeMs: String(i * 60000),
            wallTime: new Date(Date.UTC(2026, 9, 20, 0, i)).toISOString(),
            sourceRefs: [`stage:${stage}:${actorId}`],
            scriptedPrefix: false,
          })),
      ),
      ...["A", "B"].map((actorId) => ({
        stage: "later_decision" as const,
        actorId,
        referenceId: "task",
        gameTimeMs: "7200000",
        wallTime: "2026-10-20T02:00:00.000Z",
        sourceRefs: [`later:${actorId}`],
        scriptedPrefix: false,
      })),
    ],
  };
  const solo: NegotiationEvidence = {
    ...structuredClone(evidence),
    worldId: `solo:${cell.id}`,
    actors: actors.map((a, i) => ({
      ...structuredClone(a),
      actorId: `solo${i}`,
      counterpartyId: `solo${1 - i}`,
      ordinaryFinal: structuredClone(a.ordinaryStart),
    })),
    offers: [],
    contracts: [],
    lifecycle: [],
  };
  const reviews: NegotiationClaimReviews = {
    evidenceLevel: "fake-provider",
    allocations: [
      {
        id: "allocation1",
        actorId: "A",
        turnId: "turn1",
        reservedTokens: 40000,
        inputTokens: 10,
        outputTokens: 5,
        status: "reported",
      },
    ],
    reviews: [
      ...(["factuality", "dialogue"] as const).flatMap((category) =>
        ["A", "B"].map((actorId) => ({
          id: `${category}:${actorId}`,
          actorId,
          category,
          verdict: "pass" as const,
          reviewer: "inline-author" as const,
          reasonCode: "SUPPORTED",
          sourceRefs: [category === "dialogue" ? `stage:dialogue:${actorId}` : `later:${actorId}`],
        })),
      ),
    ],
    claims: [],
  };
  return { cell, evidence, solo, reviews };
}
