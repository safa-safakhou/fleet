import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { createPactEnvironment } from "../../src/environments/pact.js";

const facts = {
  world: {
    ambition: "Unblock Hall II; prioritize missing Farm II and Barracks II. Preserve existing jobs and do not raid.",
    asOfGameTimeMs: 1000,
    buildings: [
      { kind: "farm", level: 2 },
      { kind: "barracks", level: 2 },
      { kind: "hall", level: 1 },
    ],
    builders: [{ kind: "hall", targetLevel: 2, state: "waiting", prerequisiteCheck: "ready", missingBuildings: [] }],
    balances: {
      iron: { ordinaryUnits: "20600", foundingAllowanceUnits: "0" },
      silver: { ordinaryUnits: "10900", foundingAllowanceUnits: "6000" },
    },
    nextUpgradeChecks: [],
  },
  guide: {
    resourceRules: { markedPerWhole: 600 },
    constructionStockChecks: [
      { building: "hall", targetLevel: 2, stockAffordable: false, costWhole: { iron: "180", silver: "90" } },
    ],
  },
};
const observation = { payload: facts, sourceRefs: [], schemaId: "pact.observation.v1" };
const correct = { completedLevels: { farm: 2, barracks: 2, hall: 1 }, queuedPhases: { "hall:2": "stock_shortage" } };
const stale = {
  completedLevels: { farm: 1, barracks: 1, hall: 1 },
  queuedPhases: { "hall:2": "building_prerequisites" },
};
const environment = () =>
  createPactEnvironment({
    bindings: { agentFor: async () => "actor" },
    game: async () => ({ profile: async () => ({ accountId: "owner" }), close: async () => {} }),
    now: () => new Date(0),
  } as never);

it("presents current construction truth separately from unchanged owner intent at the actual environment boundary", () => {
  const before = structuredClone(facts);
  expect(environment().accountObjective?.(observation as never)).toEqual({
    intent: facts.world.ambition,
    currentState: { ...correct, stockShortfallsWholeCeil: { "hall:2": { iron: "146", silver: "62" } } },
  });
  expect(facts).toEqual(before);
});
it("rejects a stale or missing wait basis while retaining an honest resource wait", async () => {
  const s = await environment().connect({ accountRef: "owner" } as never);
  try {
    expect(s.waitSchema).toBeTypeOf("function");
    const schema = await s.waitSchema?.(observation as never);
    const check = new Ajv({ strict: false }).compile(object(schema));
    expect(check(correct)).toBe(true);
    expect(check({})).toBe(false);
    expect(await s.validateWait?.(stale, observation as never)).toMatchObject({
      valid: false,
      code: "PACT_WAIT_STATE_MISMATCH",
      detail: { currentState: correct },
    });
    expect(await s.validateWait?.({}, observation as never)).toMatchObject({ valid: false });
    expect(await s.validateWait?.(correct, observation as never)).toMatchObject({ valid: true });
    const fresh = structuredClone(observation);
    fresh.payload.world.builders[0].prerequisiteCheck = "hall_prerequisite";
    fresh.payload.world.builders[0].missingBuildings = [{ kind: "farm", level: 3 }] as never;
    expect(await s.waitSchema?.(fresh as never)).toBeUndefined();
    const absent = structuredClone(observation);
    absent.payload.world.ambition = "";
    expect(environment().accountObjective?.(absent as never)).toBeUndefined();
    expect(await s.waitSchema?.(absent as never)).toBeUndefined();
  } finally {
    await s.close();
  }
});
it("does not invent zero shortages when a current quote is missing or from a different game time", () => {
  const unknown = structuredClone(observation);
  unknown.payload.guide.constructionStockChecks = [];
  const goal = object(environment().accountObjective?.(unknown as never));
  expect(object(goal.currentState).stockShortfallsWholeCeil).toEqual({});
  const staleQuote = structuredClone(observation);
  Object.assign(staleQuote.payload.guide, { asOfGameTimeMs: 999 });
  expect(
    object(object(environment().accountObjective?.(staleQuote as never)).currentState).stockShortfallsWholeCeil,
  ).toEqual({});
});
it("replans a rejected factual wait before preparing a useful action, and delivers the structured goal once", async () => {
  const inputs: Data[] = [],
    submitted: Data[] = [],
    feedback: Data[] = [];
  const goal = {
    intent: facts.world.ambition,
    currentState: { ...correct, stockShortfallsWholeCeil: { "hall:2": { iron: "146", silver: "62" } } },
  };
  const base = environment();
  const session = await base.connect({ accountRef: "owner" } as never);
  try {
    await new ReactiveEngine().run({
      claim: {
        taskId: "task",
        turn: {
          cohort: {
            model: { route: "fixture", model: "fake" },
            budget: { maxCallsPerTurn: 3, inputByteLimit: 24000, maxOutputTokens: 2000 },
          },
        },
      },
      binding: { id: "binding" },
      observation,
      task: { key: "goal", sourceCount: 1, sourceRefsOmitted: 0 },
      eventRefs: [],
      signal: new AbortController().signal,
      accountObjective: () => goal,
      schemas: { actions: ["fixture.action"] },
      waitSchema: session.waitSchema?.bind(session),
      validateWait: session.validateWait?.bind(session),
      trace: async (_s: unknown, _l: unknown, d: Data) => {
        feedback.push(d);
      },
      model: {
        decide: async (_claim: unknown, input: Data) => {
          inputs.push(input);
          return {
            decision:
              inputs.length === 1
                ? { kind: "wait", basis: stale, summary: "Farm II and Barracks II are missing" }
                : {
                    kind: "action",
                    schemaId: "fixture.action",
                    payload: { acquire: "iron" },
                    summary: "Seek Hall stock",
                  },
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      commands: {
        submit: async (_c: unknown, intent: Data) => {
          submitted.push(intent);
          return { status: "confirmed", code: "COMMITTED" };
        },
      },
    } as never);
    expect(inputs).toHaveLength(2);
    expect(submitted).toHaveLength(1);
    expect(feedback[0]).toMatchObject({ code: "PACT_WAIT_STATE_MISMATCH", submitted: false, committed: false });
    const messages = inputs[0].messages as Data[];
    expect(JSON.parse(String(messages[1].content)).goal).toEqual(goal);
    expect(String(messages[0].content)).not.toContain(facts.world.ambition);
    const check = new Ajv({ strict: false, validateFormats: false }).compile(object(inputs[0].schema));
    expect(check({ kind: "wait", summary: "Old unsupported wait" })).toBe(false);
    expect(check({ kind: "wait", summary: "Wait for actual stock", basis: correct })).toBe(true);
  } finally {
    await session.close();
  }
});

it("fails a stale wait without dispatch when the existing turn allowance is exhausted", async () => {
  const session = await environment().connect({ accountRef: "owner" } as never);
  const submitted: unknown[] = [];
  try {
    await expect(
      new ReactiveEngine().run({
        claim: {
          turn: { cohort: { model: { route: "fixture" }, budget: { maxCallsPerTurn: 1, inputByteLimit: 24000 } } },
        },
        binding: { id: "binding" },
        observation,
        task: { key: "goal", sourceCount: 1, sourceRefsOmitted: 0 },
        eventRefs: [],
        signal: new AbortController().signal,
        schemas: { actions: [] },
        waitSchema: session.waitSchema?.bind(session),
        validateWait: session.validateWait?.bind(session),
        model: {
          decide: async () => ({
            decision: { kind: "wait", basis: stale, summary: "Old prerequisites" },
            inputTokens: 1,
            outputTokens: 1,
          }),
        },
        commands: {
          submit: async () => {
            submitted.push("unexpected");
          },
        },
      } as never),
    ).rejects.toMatchObject({ code: "MODEL_WAIT_REJECTED", notDispatched: true });
    expect(submitted).toHaveLength(0);
  } finally {
    await session.close();
  }
});

it("checks current goal facts and actual command kind on actions, not only waits", async () => {
  const { validatePactProposal, pactActionContracts } = await import("../../src/games/pact/proposals.js");
  const action = { kind: "game.training.queue", type: "spearman", count: 1 };
  expect(validatePactProposal(action, facts, { actionKind: action.kind, basis: stale })).toMatchObject({
    valid: false,
    code: "PACT_ACTION_STATE_MISMATCH",
  });
  expect(validatePactProposal(action, facts, { actionKind: "game.building.queue", basis: correct })).toMatchObject({
    valid: false,
    code: "PACT_ACTION_EFFECT_MISMATCH",
  });
  expect(validatePactProposal(action, facts, { actionKind: action.kind, basis: correct })).toMatchObject({
    valid: true,
  });
  const schema = {
    anyOf: pactActionContracts(facts).map((c) => ({
      type: "object",
      properties: { payload: c.payloadSchema, expectedOutcome: c.expectedOutcomeSchema },
      required: ["payload", "expectedOutcome"],
    })),
  };
  const check = new Ajv({ strict: false }).compile(schema);
  expect(check({ payload: action, expectedOutcome: {} })).toBe(false);
  expect(check({ payload: action, expectedOutcome: { actionKind: action.kind, basis: correct } })).toBe(true);
  expect(check({ payload: action, expectedOutcome: { actionKind: action.kind, basis: stale } })).toBe(false);
});
it("corrects a stale action premise before proposing actual Hall resource acquisition", async () => {
  const peer = "22222222-2222-4222-8222-222222222222";
  const current = { ...facts, discovery: { players: [{ kingdomId: peer }] } };
  const observation = { payload: current, sourceRefs: [], schemaId: "pact.observation.v1" };
  const { validatePactProposal } = await import("../../src/games/pact/proposals.js");
  const session = await environment().connect({ accountRef: "owner" } as never);
  let calls = 0;
  const commands: Data[] = [];
  const action = {
    kind: "game.supply.offer",
    counterpartyKingdomId: peer,
    terms: {
      aToB: { resource: "grain", wholePerHour: 2 },
      bToA: { resource: "iron", wholePerHour: 1 },
      aBond: null,
      bBond: null,
      durationHours: 1,
      noticeHours: 0,
    },
  };
  try {
    await new ReactiveEngine().run({
      claim: {
        taskId: "goal-fix",
        turn: { cohort: { model: { route: "fixture" }, budget: { maxCallsPerTurn: 3, inputByteLimit: 48000 } } },
      },
      binding: { id: "binding" },
      task: { key: "stock", sourceCount: 1, sourceRefsOmitted: 0 },
      eventRefs: [],
      observation,
      schemas: { actions: ["pact.action.v1"] },
      signal: new AbortController().signal,
      accountObjective: () => environment().accountObjective?.(observation as never),
      actionContracts: session.actionContracts?.bind(session),
      validateProposal: async (proposal: Data) =>
        validatePactProposal(object(proposal.intent).payload as Data, current, proposal.expectedOutcome as Data),
      model: {
        decide: async (_claim: unknown, input: Data) => {
          calls++;
          const packet = JSON.parse((input.messages as { content: string }[])[1].content);
          if (calls === 2) expect(packet.previousProposal.code).toBe("PACT_ACTION_STATE_MISMATCH");
          return {
            decision: {
              kind: "action",
              schemaId: "pact.action.v1",
              payload: action,
              expectedOutcome: {
                actionKind: action.kind,
                basis: calls === 1 ? stale : correct,
                trade: { youSend: action.terms.aToB, youReceive: action.terms.bToA },
              },
              summary: "Propose grain for needed Hall iron; no delivery until consent and settlement",
            },
            inputTokens: 1,
            outputTokens: 1,
          };
        },
      },
      commands: {
        submit: async (_claim: unknown, intent: Data) => {
          commands.push(intent);
          return { status: "confirmed", code: "COMMITTED" };
        },
      },
    } as never);
    expect(calls).toBe(2);
    expect(commands).toHaveLength(1);
    expect(object(commands[0].payload).kind).toBe("game.supply.offer");
  } finally {
    await session.close();
  }
});
