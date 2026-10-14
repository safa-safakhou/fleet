import { expect, it } from "vitest";
import { fitMessages } from "../../src/context.js";
import { decisionSchema } from "../../src/domain.js";
import { boundedReads, narrowRead } from "../../src/games/pact/context.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";
import { agentStatus } from "../../web/observe.js";

const environment = {
  profile: { kingdomId: "owned-fixture" },
  asOfGameTimeMs: "120000",
  balances: { iron: { ordinaryUnits: "12000" } },
  buildings: [{ kind: "hall", level: 1 }],
  builders: [{ slot: 1, state: null }],
  nextUpgradeChecks: [{ kind: "hall", targetLevel: 2, missingBuildings: [{ kind: "barracks", level: 2 }] }],
  mandate: { allowedActions: ["building.queue"] },
  constructionRecovery: { status: "progress_possible" },
  socialDelegation: { mode: "agent_decides" },
  contacts: Array.from({ length: 80 }, (_, n) => ({ kingdomId: `peer-${n}`, name: "界".repeat(40) })),
  contactRequests: Array.from({ length: 80 }, (_, n) => ({
    id: `request-${n}`,
    direction: "incoming",
    note: '\\"界'.repeat(40),
  })),
  openSupplyOffers: [{ id: "observed-offer", version: 2, signatures: [], terms: { iron: "10" } }],
  contracts: [],
  developmentRules: { body: "rules".repeat(2000) },
  observationTurn: 1,
};
it("pages a busy fresh environment, preserves core facts, whole records and a tiny requested result under the real envelope limit", () => {
  const requestedRead = {
    tool: "pact_inbox_read_v1",
    args: {},
    observedAt: "2026-10-13T00:00:00Z",
    result: { messages: [], fresh: true },
  };
  const original = structuredClone(environment);
  const context = {
    environment,
    requestedRead,
    privateNotes: "small memory",
    commandResults: [{ commandId: "original", receipt: { code: "COMMITTED" } }],
    suppliedActionSchemas: [decisionSchema],
    suppliedReadSchemas: [decisionSchema],
    decisionSchema,
  };
  expect(() => fitMessages(context, "choose", decisionSchema, 24000, boundedReads, narrowRead)).toThrow(
    "CONTEXT_LIMIT",
  );
  const messages = fitMessages(context, "choose", decisionSchema, 24000, boundedReads, narrowRead, compactEnvironment);
  expect(
    Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema)),
  ).toBeLessThanOrEqual(24000);
  const kept = JSON.parse(messages[1].content);
  expect(kept.requestedRead).toEqual(requestedRead);
  expect(kept.environment.profile).toEqual(environment.profile);
  expect(kept.environment.mandate).toEqual(environment.mandate);
  expect(kept.environment.builders).toEqual(environment.builders);
  expect(kept.environment.nextUpgradeChecks).toEqual(environment.nextUpgradeChecks);
  expect(kept.commandResults).toEqual(context.commandResults);
  expect(kept.suppliedActionSchemas).toEqual(context.suppliedActionSchemas);
  expect(kept.environment.openSupplyOffers).toEqual(environment.openSupplyOffers);
  expect(kept.environment.coverage.complete).toBe(false);
  expect(kept.environment.coverage.pages.contactRequests.omitted).toBeGreaterThan(0);
  for (const request of kept.environment.contactRequests) expect(environment.contactRequests).toContainEqual(request);
  expect(environment).toEqual(original);
});
it("reduces optional fresh pages before narrowing an otherwise deliverable large requested result", () => {
  const requestedRead = { tool: "pact_inbox_read_v1", args: {}, result: { relevant: "whole result".repeat(700) } };
  const messages = fitMessages(
    { environment, requestedRead },
    "choose",
    decisionSchema,
    13000,
    boundedReads,
    narrowRead,
    compactEnvironment,
  );
  expect(JSON.parse(messages[1].content).requestedRead).toEqual(requestedRead);
  expect(
    Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema)),
  ).toBeLessThanOrEqual(13000);
});
it("rotates paged pending records instead of starving the same tail forever", () => {
  const first = compactEnvironment(environment, 2400),
    later = compactEnvironment({ ...environment, observationTurn: 20 }, 2400);
  expect(first.contactRequests).not.toEqual(later.contactRequests);
  expect((first.contactRequests as unknown[]).length).toBeGreaterThan(0);
  expect((later.contactRequests as unknown[]).length).toBeGreaterThan(0);
  expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThanOrEqual(2400);
});
it("retains stored notes and protected requested feedback while omitting oversized continuation prose only from this input", () => {
  const context = {
    environment,
    privateNotes: '界\\"'.repeat(4000),
    requestedRead: { tool: "pact_inbox_read_v1", args: {}, result: { fresh: true } },
  };
  const messages = fitMessages(context, "choose", decisionSchema, 6000, boundedReads, narrowRead, compactEnvironment);
  const kept = JSON.parse(messages[1].content);
  expect(kept.requestedRead).toEqual(context.requestedRead);
  expect(kept.privateNotesCoverage.omitted).toBe(true);
  expect(context.privateNotes).toHaveLength(12000);
  expect(() =>
    fitMessages(
      { ...context, commandResults: [{ body: "x".repeat(30000) }] },
      "choose",
      decisionSchema,
      6000,
      boundedReads,
      narrowRead,
      compactEnvironment,
    ),
  ).toThrow("CONTEXT_LIMIT");
  expect(() => compactEnvironment({ ...environment, builders: [{ body: "x".repeat(30000) }] }, 6000)).toThrow(
    "CONTEXT_LIMIT",
  );
});
it("shows game and input failures as attention even when scheduler rows are ready, but normal waiting remains scheduled", () => {
  const a = {
    id: "fixture",
    cohort_id: "fixture",
    name: "Agent",
    ordinal: 0,
    account_id: "owned",
    kingdom_id: "kingdom",
    state: "ready",
    credential_state: "ready",
    next_due_at: null,
    last_turn_at: null,
    reason: null,
    strategy: { profile: "merchant", objective: "develop", riskTolerance: 0.3, patience: 2, horizon: "balanced" },
    latest_state: "finished",
  };
  expect(agentStatus({ ...a, latest_code: "CONTEXT_LIMIT" }, "running")).toBe("Needs attention");
  expect(agentStatus({ ...a, game_attention_label: "Game needs owner recovery" }, "paused")).toBe("Needs attention");
  expect(agentStatus({ ...a, latest_code: "WAIT" }, "running")).toBe("Scheduled");
});

it("delivers real global identities and truthful readiness beside a busy inbox without truncating public prose into claims", () => {
  const peers = Array.from({ length: 8 }, (_, n) => ({
    kingdomId: `outside-fleet-${n}`,
    handle: `global-${n}`,
    displayName: `Global ${n}`,
    relationship: { contact: false, incomingIntroduction: false, outgoingIntroduction: false },
    communication: {
      route: "introduction_required",
      agentActivity: {
        signal: "older_observation",
        lastObservedAt: "2026-10-10T00:00:00Z",
        boundedRunObservedActive: false,
      },
    },
    publicNotice: { commentary: "untrusted player claim ".repeat(1000) },
  }));
  const source = { ...environment, publicDiscovery: { players: peers, selection: "varied_worldwide" } };
  const original = structuredClone(source);
  const packed = compactEnvironment(source, 4000);
  const delivered = (packed.publicDiscovery as { players: typeof peers }).players;
  expect(delivered.length).toBeGreaterThan(0);
  expect((packed.contactRequests as unknown[]).length).toBeGreaterThan(0);
  for (const peer of delivered) {
    const actual = peers.find((p) => p.kingdomId === peer.kingdomId)!;
    expect(peer.communication).toEqual(actual.communication);
    expect(peer.relationship).toEqual(actual.relationship);
    expect(peer.publicNotice).toBeUndefined();
  }
  expect(packed.profile).toEqual(environment.profile);
  expect(packed.mandate).toEqual(environment.mandate);
  expect(packed.nextUpgradeChecks).toEqual(environment.nextUpgradeChecks);
  expect(
    (packed.coverage as { pages: { publicDiscovery: { observed: number; retained: number } } }).pages.publicDiscovery,
  ).toMatchObject({ observed: 8, retained: delivered.length });
  expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThanOrEqual(4000);
  expect(source).toEqual(original);
});
