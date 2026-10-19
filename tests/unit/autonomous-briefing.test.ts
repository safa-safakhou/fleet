import { expect, it } from "vitest";
import { object } from "../../src/domain.js";
import { compactFacts } from "../../src/games/pact/adapter.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";

const facts = {
  world: {
    ambition: "Develop a resilient kingdom and choose your own legal actions",
    asOfGameTimeMs: 1000,
    authority: { allowedActions: ["building.queue", "world.read"] },
    buildings: [
      { kind: "hall", level: 1 },
      { kind: "farm", level: 1 },
      { kind: "barracks", level: 1 },
    ],
    builders: [
      {
        slot: 1,
        state: "waiting",
        kind: "hall",
        targetLevel: 2,
        instructionId: "hall-job",
        missingBuildings: [
          { kind: "farm", level: 2 },
          { kind: "barracks", level: 2 },
        ],
      },
      { slot: 2, state: null, instructionId: null },
    ],
    nextUpgradeChecks: [
      { kind: "farm", targetLevel: 2, prerequisiteCheck: "ready", missingBuildings: [] },
      {
        kind: "hall",
        targetLevel: 2,
        prerequisiteCheck: "hall_prerequisite",
        missingBuildings: [
          { kind: "farm", level: 2 },
          { kind: "barracks", level: 2 },
        ],
      },
    ],
  },
  guide: {
    mandate: { version: 2, allowedActions: ["building.queue", "world.read"] },
    constructionStockChecks: [
      { building: "farm", targetLevel: 2, stockAffordable: true, costWhole: { iron: "40", silver: "20" }, busy: false },
      { building: "hall", targetLevel: 2, stockAffordable: true, busy: true },
    ],
  },
};
it("makes a standing owner objective and observed prerequisite options survive packing without granting new authority", () => {
  const full = compactFacts(facts);
  const brief = object(full.agentBriefing);
  expect(brief.ownerIntent).toEqual({ status: "provided", objective: facts.world.ambition });
  expect(object(brief.execution).lease).toBe("managed_by_host");
  expect(object(brief.execution).allowedActions).toEqual(facts.world.authority.allowedActions);
  expect(object(brief.construction).availableQueueSlots).toEqual([2]);
  expect(object(brief.construction).options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        building: "farm",
        targetLevel: 2,
        prerequisiteCheck: "ready",
        stockAffordable: true,
        busy: false,
      }),
      expect.objectContaining({ building: "hall", busy: true, prerequisiteCheck: "hall_prerequisite" }),
    ]),
  );
  const packed = compactEnvironment({ ...full, optionalHistory: "x".repeat(40000) }, 12000);
  expect(packed.agentBriefing).toEqual(brief);
  expect(object(brief.execution).humanOnly).toContain(
    "Explicit human-only actions still require their existing owner approval.",
  );
});
it("does not invent an objective, stock affordability, queue slot or permission when the owned facts omit them", () => {
  const brief = object(compactFacts({ world: {}, guide: {} }).agentBriefing);
  expect(brief.ownerIntent).toEqual({ status: "absent", objective: null });
  expect(object(brief.execution).allowedActions).toEqual([]);
  expect(object(brief.construction).availableQueueSlots).toEqual([]);
  expect(object(brief.construction).options).toEqual([]);
});

it("links a waiting target to its observed ready prerequisites instead of presenting the target as work that must only be awaited", () => {
  const current = structuredClone(facts);
  current.world.nextUpgradeChecks.push({
    kind: "barracks",
    targetLevel: 2,
    prerequisiteCheck: "ready",
    missingBuildings: [],
  });
  current.guide.constructionStockChecks.push({
    building: "barracks",
    targetLevel: 2,
    stockAffordable: true,
    busy: false,
  });
  const brief = object(compactFacts(current).agentBriefing);
  const work = object(brief.construction).prerequisiteWork;
  expect(work).toEqual([
    {
      target: { building: "hall", targetLevel: 2, alreadyQueued: true },
      readySteps: [
        { building: "farm", targetLevel: 2 },
        { building: "barracks", targetLevel: 2 },
      ],
      activeSteps: [],
      unresolvedSteps: [],
    },
  ]);
  expect(object(compactEnvironment(compactFacts(current), 12000).agentBriefing).construction).toEqual(
    brief.construction,
  );
});

it("distinguishes already active work and unknown checks, and never advertises an immediate step without queue space or delegation", () => {
  const current = structuredClone(facts);
  current.world.builders[1] = {
    slot: 2,
    state: "active",
    kind: "farm",
    targetLevel: 2,
    instructionId: "farm-job",
    missingBuildings: [],
  } as (typeof current.world.builders)[1];
  const work = object(object(compactFacts(current).agentBriefing).construction).prerequisiteWork;
  expect(work).toEqual([
    {
      target: { building: "hall", targetLevel: 2, alreadyQueued: true },
      readySteps: [],
      activeSteps: [{ building: "farm", targetLevel: 2 }],
      unresolvedSteps: [{ building: "barracks", targetLevel: 2 }],
    },
  ]);
  const denied = structuredClone(facts);
  denied.world.authority.allowedActions = ["world.read"];
  expect(object(object(compactFacts(denied).agentBriefing).construction).prerequisiteWork).toEqual([
    expect.objectContaining({ readySteps: [] }),
  ]);
  const full = structuredClone(facts);
  full.world.builders[1] = {
    slot: 2,
    state: "waiting",
    kind: "market",
    targetLevel: 2,
    instructionId: "market-job",
    missingBuildings: [],
  } as (typeof full.world.builders)[1];
  expect(object(object(compactFacts(full).agentBriefing).construction).prerequisiteWork).toEqual([
    expect.objectContaining({ readySteps: [] }),
  ]);
});

const stockBlocked = {
  world: {
    ambition: "Unblock queued Hall II: prioritize missing Farm II and Barracks II before unrelated upgrades.",
    asOfGameTimeMs: 1000,
    buildings: [
      { kind: "hall", level: 1 },
      { kind: "farm", level: 2 },
      { kind: "barracks", level: 2 },
    ],
    builders: [
      {
        slot: 1,
        instructionId: "hall-job",
        kind: "hall",
        targetLevel: 2,
        state: "waiting",
        prerequisiteCheck: "ready",
        missingBuildings: [],
      },
    ],
    nextUpgradeChecks: [{ kind: "hall", targetLevel: 2, prerequisiteCheck: "ready", missingBuildings: [] }],
    balances: {
      iron: { ordinaryUnits: "20600", foundingAllowanceUnits: "0", lockedUnits: "999999" },
      silver: { ordinaryUnits: "10900", foundingAllowanceUnits: "6000", lockedUnits: "999999" },
    },
    training: [{ batchId: "training-job", type: "spearman", requestedCount: 1, completedCount: 0 }],
  },
  guide: {
    resourceRules: { markedPerWhole: 600 },
    constructionStockChecks: [
      {
        building: "hall",
        targetLevel: 2,
        stockAffordable: false,
        costWhole: { iron: "180", silver: "90" },
        busy: true,
      },
    ],
  },
};
it("reconciles stale goal assumptions against completed prerequisites and separates queued stock shortage from building readiness", () => {
  const full = compactFacts(stockBlocked);
  const construction = object(object(full.agentBriefing).construction);
  expect(construction.queuedProgress).toEqual([
    {
      building: "hall",
      targetLevel: 2,
      instructionId: "hall-job",
      slot: 1,
      state: "waiting",
      prerequisiteCheck: "ready",
      missingBuildings: [],
      phase: "stock_shortage",
      stockAffordable: false,
      stockGaps: [
        {
          resource: "iron",
          costWhole: "180",
          availableConstructionUnits: "20600",
          shortfallUnits: "87400",
          shortfallWholeCeil: "146",
        },
        {
          resource: "silver",
          costWhole: "90",
          availableConstructionUnits: "16900",
          shortfallUnits: "37100",
          shortfallWholeCeil: "62",
        },
      ],
    },
  ]);
  expect(object(full.agentBriefing).construction).toEqual(
    expect.objectContaining({
      completedBuildings: stockBlocked.world.buildings,
    }),
  );
  expect(full.training).toEqual(stockBlocked.world.training);
  const packed = compactEnvironment({ ...full, optionalHistory: "x".repeat(30000) }, 12000);
  expect(packed.agentBriefing).toEqual(full.agentBriefing);
  expect(packed.training).toEqual(stockBlocked.world.training);
  expect(full.ambition).toBe(stockBlocked.world.ambition);
});
it("does not claim a stock blocker or zero shortage for active work, missing facts or a mismatched target quote", () => {
  const active = structuredClone(stockBlocked);
  active.world.builders[0].state = "active";
  expect(object(object(compactFacts(active).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({ phase: "active", stockGaps: [], stockAffordable: null }),
  ]);
  const unknown = structuredClone(stockBlocked);
  unknown.guide.constructionStockChecks[0].targetLevel = 3;
  expect(object(object(compactFacts(unknown).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({ phase: "queue_or_admission_check", stockGaps: null, stockAffordable: null }),
  ]);
  const missingBalance = structuredClone(stockBlocked);
  delete (missingBalance.world.balances as Record<string, unknown>).silver;
  expect(object(object(compactFacts(missingBalance).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({
      phase: "stock_shortage",
      stockGaps: [
        expect.objectContaining({ resource: "iron" }),
        { resource: "silver", costWhole: "90", shortfallUnits: null },
      ],
    }),
  ]);
});
it("updates the queued phase when fresh checks change, without treating a blocked building as only a stock problem", () => {
  const current = structuredClone(stockBlocked);
  current.world.nextUpgradeChecks[0] = {
    kind: "hall",
    targetLevel: 2,
    prerequisiteCheck: "hall_prerequisite",
    missingBuildings: [{ kind: "farm", level: 2 }],
  } as (typeof current.world.nextUpgradeChecks)[0];
  current.world.builders[0].prerequisiteCheck = "hall_prerequisite";
  current.world.builders[0].missingBuildings = [
    { kind: "farm", level: 2 },
  ] as (typeof current.world.builders)[0]["missingBuildings"];
  expect(object(object(compactFacts(current).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({ phase: "building_prerequisites", missingBuildings: [{ kind: "farm", level: 2 }] }),
  ]);
  current.guide.constructionStockChecks[0].stockAffordable = true;
  current.world.nextUpgradeChecks[0].prerequisiteCheck = "ready";
  current.world.nextUpgradeChecks[0].missingBuildings = [];
  current.world.builders[0].prerequisiteCheck = "ready";
  current.world.builders[0].missingBuildings = [];
  expect(object(object(compactFacts(current).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({ phase: "queue_or_admission_check", stockAffordable: true }),
  ]);
});

it("does not combine a newer scoped construction/world read with an older stock affordability check", async () => {
  const { pactAdapter } = await import("../../src/games/pact/adapter.js");
  const current = structuredClone(stockBlocked) as import("../../src/domain.js").Data;
  object(current.guide).asOfGameTimeMs = 1000;
  pactAdapter.applyRead?.(
    current,
    "pact_world_read_v1",
    {},
    {
      ...stockBlocked.world,
      profile: { kingdomId: "self" },
      asOfGameTimeMs: 2000,
      balances: {
        iron: { ordinaryUnits: "108000", foundingAllowanceUnits: "0" },
        silver: { ordinaryUnits: "54000", foundingAllowanceUnits: "0" },
      },
    },
    "self",
  );
  expect(object(object(compactFacts(current).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({ phase: "queue_or_admission_check", stockAffordable: null, stockGaps: null }),
  ]);
  pactAdapter.applyRead?.(
    current,
    "pact_agent_guide_v1",
    { topic: "start" },
    {
      ...stockBlocked.guide,
      asOfGameTimeMs: 2000,
      constructionStockChecks: [{ ...stockBlocked.guide.constructionStockChecks[0], stockAffordable: true }],
    },
    "self",
  );
  expect(object(object(compactFacts(current).agentBriefing).construction).queuedProgress).toEqual([
    expect.objectContaining({
      phase: "queue_or_admission_check",
      stockAffordable: true,
      stockGaps: [expect.objectContaining({ shortfallUnits: "0" }), expect.objectContaining({ shortfallUnits: "0" })],
    }),
  ]);
});
