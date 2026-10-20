import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { pactActionContracts, validatePactProposal } from "../../src/games/pact/proposals.js";

const self = "11111111-1111-4111-8111-111111111111";
const peer = "22222222-2222-4222-8222-222222222222";
const facts = {
  world: {
    profile: { kingdomId: self },
    buildings: [{ kind: "hall", level: 1 }],
    builders: [
      { slot: 1, state: "waiting", kind: "hall" },
      { slot: 2, state: null },
    ],
  },
  guide: { contacts: [], contactRequests: [] },
  discovery: { players: [{ kingdomId: self }, { kingdomId: peer }] },
  development: { hallUnlocks: { archers: 2, riders: 3, rams: 4, lending: 3 } },
};
const compile = (f: Data) =>
  new Ajv({ strict: false, validateFormats: false }).compile({
    anyOf: pactActionContracts(f).map((c) => c.payloadSchema),
  });
const terms = {
  aToB: { resource: "grain", wholePerHour: 2 },
  bToA: null,
  aBond: null,
  bBond: null,
  durationHours: 6,
  noticeHours: 0,
};

it("legacy upfront generation excludes occupied slots/buildings and Hall-locked training", () => {
  const schemas = pactAdapter.availableActions?.(facts, null)?.schemas;
  const check = new Ajv({ strict: false, validateFormats: false }).compile({ anyOf: schemas });
  const farm = { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 2 };
  expect(check(farm)).toBe(true);
  expect(check({ ...farm, slot: 1 })).toBe(false);
  expect(check({ ...farm, building: "hall" })).toBe(false);
  expect(check({ kind: "game.training.queue", type: "spearman", count: 1 })).toBe(true);
  expect(check({ kind: "game.training.queue", type: "archer", count: 1 })).toBe(false);
});
it("modern proposals use exact trade contracts instead of accepting arbitrary garrison arguments", () => {
  const check = compile(facts);
  expect(check({ kind: "game.supply.offer", counterpartyKingdomId: peer, terms })).toBe(true);
  expect(check({ kind: "game.supply.offer", recipient: { kingdomId: peer }, resources: { grain: 1 } })).toBe(false);
  expect(
    check({
      kind: "game.garrison.offer",
      recipient: { kingdomId: self },
      offerId: "00000000-0000-0000-0000-000000000000",
      resources: {},
      durationHours: 24,
    }),
  ).toBe(false);
  expect(check({ kind: "game.supply.offer", counterpartyKingdomId: self, terms })).toBe(false);
});
it("self interactions and direct messages without an observed contact fail locally, while introductions and real contacts remain usable", () => {
  for (const action of [
    { kind: "game.contact.request", recipientKingdomId: self, note: "Hello" },
    { kind: "game.message.send", recipientKingdomId: self, body: "Hello" },
    { kind: "game.supply.offer", counterpartyKingdomId: self, terms },
    { kind: "game.garrison.offer", hostKingdomId: self, terms: {} },
  ])
    expect(pactAdapter.preflight?.(action, facts)?.code).toBe("OBSERVED_SELF_TARGET");
  const message = { kind: "game.message.send", recipientKingdomId: peer, body: "Hello" };
  expect(validatePactProposal(message, facts).valid).toBe(false);
  expect(compile(facts)(message)).toBe(false);
  expect(compile(facts)({ kind: "game.contact.request", recipientKingdomId: peer, note: "Hello" })).toBe(true);
  const connected = { ...facts, guide: { ...facts.guide, contacts: [{ kingdomId: peer }] } };
  expect(validatePactProposal(message, connected).valid).toBe(true);
  expect(compile(connected)(message)).toBe(true);
});
it("garrison lending and advanced training require the observed Hall unlock without hiding valid advanced choices", () => {
  const archer = { kind: "game.training.queue", type: "archer", count: 1 };
  expect(validatePactProposal(archer, facts).code).toBe("OBSERVED_HALL_LOCKED");
  const advanced = { ...facts, world: { ...facts.world, buildings: [{ kind: "hall", level: 3 }] } };
  expect(compile(advanced)(archer)).toBe(true);
  expect(
    compile(advanced)({
      kind: "game.garrison.offer",
      hostKingdomId: peer,
      terms: { units: [{ type: "spearman", count: 1 }], durationHours: 1, lenderBond: null, hostBond: null },
    }),
  ).toBe(true);
});

it("does not lose target exclusion or the legal trade path when observations are compacted", async () => {
  const { compactFacts } = await import("../../src/games/pact/adapter.js");
  const { compactEnvironment, expandFactTables } = await import("../../src/games/pact/environment.js");
  const compact = expandFactTables(compactEnvironment(compactFacts(facts), 10000));
  expect(object(object(object(compact).agentBriefing).interactions).selfKingdomId).toBe(self);
  expect(object(object(object(compact).agentBriefing).interactions).observedPeerIds).toEqual([peer]);
  const check = compile(facts);
  expect(check({ kind: "game.supply.offer", counterpartyKingdomId: peer, terms })).toBe(true);
  expect(check({ kind: "game.supply.offer", counterpartyKingdomId: peer, terms, recipient: { kingdomId: self } })).toBe(
    false,
  );
});

it("requires observed request/offer/contract references in generation instead of inviting guessed IDs", () => {
  const empty = {
    ...facts,
    guide: {
      ...facts.guide,
      openSupplyOffers: [],
      activeSupplyContracts: [],
      openGarrisonOffers: [],
      activeGarrisonContracts: [],
    },
  };
  const check = compile(empty);
  expect(check({ kind: "game.contact.answer", requestId: peer, accept: true })).toBe(false);
  expect(check({ kind: "game.supply.counter", offerId: peer, expectedVersion: 1, terms })).toBe(false);
  expect(check({ kind: "game.supply.sign", offerId: peer, version: 1 })).toBe(false);
  const observed = { ...empty, guide: { ...empty.guide, openSupplyOffers: [{ id: peer, version: 1 }] } };
  expect(compile(observed)({ kind: "game.supply.counter", offerId: peer, expectedVersion: 1, terms })).toBe(true);
  expect(compile(observed)({ kind: "game.supply.sign", offerId: peer, version: 1 })).toBe(true);
});

it("excludes a Hall proposal that strands the last waiting position, while retaining its ready prerequisite", () => {
  const queue = {
    ...facts,
    world: {
      ...facts.world,
      buildings: [
        { kind: "hall", level: 1 },
        { kind: "farm", level: 2 },
        { kind: "barracks", level: 1 },
      ],
      builders: [
        { slot: 1, state: null },
        {
          slot: 2,
          state: "waiting",
          kind: "farm",
          targetLevel: 3,
          prerequisiteCheck: "blocked",
          missingBuildings: [{ kind: "hall", level: 2 }],
        },
      ],
      nextUpgradeChecks: [
        {
          kind: "hall",
          targetLevel: 2,
          prerequisiteCheck: "blocked",
          missingBuildings: [{ kind: "barracks", level: 2 }],
        },
        { kind: "barracks", targetLevel: 2, prerequisiteCheck: "ready", missingBuildings: [] },
      ],
    },
  };
  const hall = { kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 };
  expect(pactAdapter.preflight?.(hall, queue)?.code).toBe("CONSTRUCTION_DEADLOCK_PREVENTED");
  for (const schema of [
    pactActionContracts(queue)[0].payloadSchema,
    { anyOf: pactAdapter.availableActions?.(queue, null)?.schemas },
  ]) {
    const check = new Ajv({ strict: false, validateFormats: false }).compile(schema);
    expect(check(hall)).toBe(false);
    expect(check({ ...hall, building: "barracks" })).toBe(true);
  }
});
it("does not mistake a kingdom UUID for a raid reference, while retaining an observed declared raid", () => {
  const raid = { kind: "game.raid.accept", raidId: peer, units: [{ type: "spearman", count: 1 }] };
  const absent = { ...facts, world: { ...facts.world, raids: [] } };
  expect(compile(absent)(raid)).toBe(false);
  expect(validatePactProposal(raid, absent).code).toBe("OBSERVED_RAID_NOT_FOUND");
  const declared = {
    ...facts,
    world: {
      ...facts.world,
      asOfGameTimeMs: 1,
      raids: [{ raidId: peer, status: "declared", role: "contributor", lockGameTimeMs: 100 }],
    },
  };
  expect(compile(declared)(raid)).toBe(true);
  expect(validatePactProposal(raid, declared).valid).toBe(true);
  const locked = {
    ...declared,
    world: { ...declared.world, raids: [{ raidId: peer, status: "locked", lockGameTimeMs: 0 }] },
  };
  expect(validatePactProposal(raid, locked).code).toBe("OBSERVED_RAID_NOT_JOINABLE");
});

it("does not advertise raids using Home Guard when a fresh complete owned unit page has no ordinary home troops", () => {
  const raid = { kind: "game.raid.accept", raidId: peer, units: [{ type: "spearman", count: 1 }] };
  const unit = {
    id: self,
    type: "Unit",
    ownerKingdomId: self,
    hostKingdomId: self,
    placement: "home",
    homeGuard: true,
    battleLocked: false,
    asOfGameTimeMs: 1,
  };
  const observed = {
    ...facts,
    world: {
      ...facts.world,
      asOfGameTimeMs: 1,
      raids: [{ raidId: peer, status: "declared", role: "contributor", lockGameTimeMs: 100 }],
      unitReferences: { schemaVersion: "pact.references.v1", hasMore: false, units: [unit] },
    },
  };
  expect(compile(observed)(raid)).toBe(false);
  expect(compile(observed)({ kind: "game.scout.start", targetKingdomId: peer })).toBe(false);
  expect(validatePactProposal(raid, observed).code).toBe("OBSERVED_RAID_UNITS_UNAVAILABLE");
  const ordinary = {
    ...observed,
    world: {
      ...observed.world,
      unitReferences: { ...observed.world.unitReferences, units: [{ ...unit, homeGuard: false }] },
    },
  };
  expect(compile(ordinary)(raid)).toBe(true);
  expect(validatePactProposal(raid, ordinary).valid).toBe(true);
  const partial = {
    ...observed,
    world: { ...observed.world, unitReferences: { ...observed.world.unitReferences, hasMore: true } },
  };
  expect(compile(partial)(raid)).toBe(true);
  expect(compile(partial)({ kind: "game.scout.start", targetKingdomId: peer })).toBe(true);
});

it("shares only an observed completed scout operation", () => {
  const share = { kind: "game.scout.share", operationId: peer, recipientKingdomId: peer };
  const absent = { ...facts, world: { ...facts.world, scouts: [] } };
  expect(compile(absent)(share)).toBe(false);
  expect(validatePactProposal(share, absent).code).toBe("OBSERVED_SCOUT_NOT_FOUND");
  const completed = { ...facts, world: { ...facts.world, scouts: [{ operationId: peer, status: "completed" }] } };
  expect(compile(completed)(share)).toBe(true);
  expect(validatePactProposal(share, completed).valid).toBe(true);
});

it("excludes another training batch when observed owned training is occupied, without removing empty or unknown queues", () => {
  const action = { kind: "game.training.queue", type: "spearman", count: 1 };
  const busy = {
    ...facts,
    world: { ...facts.world, training: [{ batchId: peer, type: "spearman", requestedCount: 1, completedCount: 0 }] },
  };
  expect(compile(busy)(action)).toBe(false);
  expect(validatePactProposal(action, busy)).toMatchObject({ valid: false, code: "OBSERVED_TRAINING_BUSY" });
  expect(compile({ ...facts, world: { ...facts.world, training: [] } })(action)).toBe(true);
  expect(compile(facts)(action)).toBe(true);
  expect(validatePactProposal(action, facts).valid).toBe(true);
  expect(
    compile({ ...busy, world: { ...busy.world, training: [{ batchId: peer, requestedCount: 1, completedCount: 1 }] } })(
      action,
    ),
  ).toBe(true);
});
