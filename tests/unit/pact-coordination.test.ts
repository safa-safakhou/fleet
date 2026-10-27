import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { z } from "zod";
import { config } from "../../src/config.js";
import { type Data, FleetError, type GamePort, ProposalRejection } from "../../src/domain.js";
import { WorkerResultSchema } from "../../src/engines/specialists/proposals.js";
import { createPactEnvironment } from "../../src/environments/pact.js";
import { pactNativeIntentDigest } from "../../src/games/pact/action-effects.js";
import { PactCoordination } from "../../src/games/pact/coordination.js";
import type { BindingRef, Observation, Proposal } from "../../src/platform/contracts.js";

function fixture() {
  const binding: BindingRef = {
    id: randomUUID(),
    accountRef: randomUUID(),
    actorRef: randomUUID(),
    entityRef: randomUUID(),
    environment: { id: "pact", version: "1", instanceId: "fixture" },
  };
  let revision = "native-revision",
    opens = 0,
    guarded = 0;
  const actions = [{ kind: "game.building.queue", building: "hall", targetLevel: 2, slot: 1 }];
  const game = {
    open: async () => {
      opens++;
    },
    read: async () => ({
      schemaVersion: "pact.decision-support.v2",
      kingdomId: binding.entityRef,
      candidates: actions.map((action, i) => ({
        id: `candidate:${i}`,
        kind: "action",
        action,
        checks: { affordable: true },
      })),
    }),
    effects: async (command: Data) => ({
      schemaVersion: "fleet.action-effects.v1",
      revision,
      intentDigest: pactNativeIntentDigest(command),
      actionKey: (command.action as Data).kind,
      claims: [{ kind: "resource", schemaId: "pact.stock.v1", key: "iron:founding", units: "5" }],
      capacities: [{ schemaId: "pact.stock.v1", key: "iron:founding", remainingUnits: "10" }],
      sourceRefs: [`effects-owner:${revision}`],
      validUntil: { clockId: "utc", value: "2026-10-25T00:00:30.000Z" },
      coverage: { complete: true, omitted: [] },
      supported: true,
    }),
    submitGuarded: async (command: Data, guard: Data) => {
      if (guard.expectedRevision !== revision) throw new FleetError("STALE_VERSION");
      guarded++;
      return { commandId: command.commandId, code: "COMMITTED" };
    },
  } as unknown as GamePort;
  const base: Observation = {
    schemaId: "pact.observation.v1",
    revision: "world-time",
    observedAt: "2026-10-25T00:00:00.000Z",
    environmentTime: { clockId: "pact.game-time-ms", value: "1000" },
    sourceRefs: [],
    payload: {},
    coverage: {},
  };
  const policy = new PactCoordination(binding, game, () => new Date("2026-10-25T00:00:00Z"));
  return {
    binding,
    game,
    base,
    policy,
    actions,
    counts: () => ({ opens, guarded }),
    advance: () => {
      revision = "changed";
    },
  };
}
it("requires an explicit version plus both native protocols before advertising coordination", () => {
  expect(createPactEnvironment({} as never).capabilities.coordination).toBeUndefined();
  expect(() => createPactEnvironment({ coordinationVersion: "pact.coordination.v1" } as never)).toThrow(
    "COORDINATION_PROTOCOL_REQUIRED",
  );
  expect(
    createPactEnvironment({
      coordinationVersion: "pact.coordination.v1",
      outlookVersion: "pact.agent-outlook.v1",
      actionEffectsVersion: "fleet.action-effects.v1",
    } as never).capabilities.coordination,
  ).toBe(true);
  const base = {
    DATABASE_URL: "postgres://fixture/test",
    FLEET_OPERATOR_SECRET: "fixture",
    FLEET_VAULT_KEY: "fixture",
  };
  expect(config({ ...base, FLEET_PACT_COORDINATION_VERSION: "pact.coordination.v1" }).pactCoordinationVersion).toBe(
    "pact.coordination.v1",
  );
  expect(() => config({ ...base, FLEET_PACT_COORDINATION_VERSION: "invented" })).toThrow();
});
it("projects only native complete claims and binds a proposal to native guarded execution", async () => {
  const f = fixture(),
    view = await f.policy.observe(f.base);
  expect(view.revision).toBe("native-revision");
  expect(view.coordination?.atomicExpectedVersion).toBe(true);
  expect(view.coordination?.capacities[0].remainingUnits).toBe("10");
  const proposal: Proposal = {
    taskId: "task",
    intent: {
      commandId: randomUUID(),
      bindingId: f.binding.id,
      schemaId: "pact.action.v1",
      expectedVersion: view.revision,
      payload: f.actions[0],
    },
    evidenceRefs: view.sourceRefs,
    expectedOutcome: {},
    claims: [{ kind: "resource", schemaId: "pact.stock.v1", key: "iron:founding", units: "5" }],
    conflicts: [],
  };
  expect(await f.policy.validate(proposal, view)).toMatchObject({ valid: true });
  expect(await f.policy.execute(proposal.intent)).toMatchObject({ code: "COMMITTED" });
  expect(f.counts()).toEqual({ opens: 1, guarded: 1 });
});
it("offers distinct building targets and a discovered cold introduction within the bounded native menu", async () => {
  const f = fixture();
  f.actions.splice(
    0,
    1,
    ...["barracks", "farm", "mine", "market"].flatMap((building) =>
      [1, 2].map((slot) => ({ kind: "game.building.queue", building, targetLevel: 2, slot })),
    ),
  );
  const peer = randomUUID();
  f.base.payload = {
    world: {
      profile: { kingdomId: f.binding.entityRef },
      authority: { allowedActions: ["building.queue", "contact.request"] },
    },
    guide: { contacts: [], contactRequests: [] },
    discovery: { players: [{ kingdomId: peer }] },
  };
  const view = await f.policy.observe(f.base);
  const building = view.coordination!.focuses.find((x) => x.id === "game.building.queue")!;
  expect(new Set((building.observation.options as Data[]).map((o) => (o.payload as Data).building))).toEqual(
    new Set(["barracks", "farm", "mine", "market"]),
  );
  const contact = view.coordination!.focuses.find((x) => x.id === "game.contact.request");
  expect(contact?.observation.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ payload: expect.objectContaining({ recipientKingdomId: peer }) }),
    ]),
  );
  expect(view.coordination!.coverage.nativeQuotes).toBeLessThanOrEqual(8);
});
it("retains the immediate trade perspective in quoted proposal outcomes", async () => {
  const f = fixture(),
    peer = randomUUID();
  const payload = {
    kind: "game.supply.offer",
    counterpartyKingdomId: peer,
    terms: {
      aToB: { resource: "grain", wholePerHour: 1 },
      bToA: { resource: "iron", wholePerHour: 1 },
      aBond: null,
      bBond: null,
      durationHours: 1,
      noticeHours: 0,
    },
    expiryMinutes: 30,
  };
  f.actions.splice(0);
  f.game.read = async () => ({
    schemaVersion: "pact.decision-support.v2",
    kingdomId: f.binding.entityRef,
    candidates: [{ kind: "action", action: payload }],
  });
  const view = await f.policy.observe(f.base),
    focus = view.coordination?.focuses.find((x) => x.id === payload.kind);
  if (!focus) throw Error("EXPECTED_NATIVE_TRADE_FOCUS");
  expect((focus.observation.options as Data[])[0].expectedOutcome).toMatchObject({
    trade: { youSend: payload.terms.aToB, youReceive: payload.terms.bToA },
  });
});
it("feeds back an unsupported coordinator abstention without forcing a quoted action", async () => {
  const f = fixture(),
    view = await f.policy.observe(f.base);
  const input = {
    schema: {},
    messages: [{ role: "user", content: JSON.stringify({ stage: "worker", focus: view.coordination!.focuses[0] }) }],
  };
  expect(await f.policy.grounding.validate({ summary: "Nothing to do", proposal: null }, view, input)).toMatchObject({
    code: "PACT_ABSTENTION_REASON_REQUIRED",
    retryable: true,
  });
  expect(
    await f.policy.grounding.validate(
      {
        summary: "Deferring",
        proposal: null,
        deferral: {
          reason: "risk_review",
          explanation: "Preserve reserves while assessing the owner goal.",
          reconsiderWhen: "Next stock review.",
        },
      },
      view,
      input,
    ),
  ).toBeNull();
});
it("rejects forged or omitted costs and stale revisions without rebasing or dispatch", async () => {
  const f = fixture(),
    view = await f.policy.observe(f.base);
  const proposal: Proposal = {
    taskId: "task",
    intent: {
      commandId: randomUUID(),
      bindingId: f.binding.id,
      schemaId: "pact.action.v1",
      expectedVersion: view.revision,
      payload: f.actions[0],
    },
    evidenceRefs: view.sourceRefs,
    expectedOutcome: {},
    claims: [],
    conflicts: [],
  };
  expect(await f.policy.validate(proposal, view)).toMatchObject({ valid: false, code: "CLAIMS_DO_NOT_MATCH_ACTION" });
  proposal.claims = [{ kind: "resource", schemaId: "pact.stock.v1", key: "iron:founding", units: "5" }];
  f.advance();
  expect(await f.policy.validate(proposal, view)).toMatchObject({ valid: false, code: "STALE_PROPOSAL" });
  await expect(f.policy.execute(proposal.intent)).rejects.toThrow("COORDINATION_VALIDATION_REQUIRED");
  expect(f.counts().guarded).toBe(0);
});
it("fails closed on mixed revisions, incomplete coverage and foreign owners", async () => {
  for (const kind of ["mixed", "incomplete", "foreign"] as const) {
    const f = fixture(),
      original = f.game.effects!.bind(f.game);
    if (kind === "mixed") f.actions.push({ ...f.actions[0], slot: 2 });
    let n = 0;
    f.game.effects = async (command) => {
      const q = (await original(command)) as Data;
      if (kind === "mixed" && n++) q.revision = "another";
      if (kind === "incomplete") q.coverage = { complete: false, omitted: ["cost"] };
      return q;
    };
    if (kind === "foreign") f.base.payload.world = { profile: { kingdomId: randomUUID() } };
    await expect(f.policy.observe(f.base)).rejects.toThrow();
    expect(f.counts().guarded).toBe(0);
  }
});
it("retains server rejection between validation and commit and never renews the quoted lease", async () => {
  const f = fixture(),
    view = await f.policy.observe(f.base);
  const proposal: Proposal = {
    taskId: "task",
    intent: {
      commandId: randomUUID(),
      bindingId: f.binding.id,
      schemaId: "pact.action.v1",
      expectedVersion: view.revision,
      payload: f.actions[0],
    },
    evidenceRefs: view.sourceRefs,
    expectedOutcome: {},
    claims: [{ kind: "resource", schemaId: "pact.stock.v1", key: "iron:founding", units: "5" }],
    conflicts: [],
  };
  await f.policy.validate(proposal, view);
  f.advance();
  await expect(f.policy.execute(proposal.intent)).rejects.toThrow("STALE_VERSION");
  expect(f.counts()).toEqual({ opens: 1, guarded: 0 });
});
it("binds worker generation to the delivered native payload, full claims and source references", async () => {
  const f = fixture(),
    view = await f.policy.observe(f.base),
    focus = view.coordination!.focuses[0];
  const prepared = f.policy.grounding.prepare(
    {
      messages: [{ role: "user", content: JSON.stringify({ stage: "worker", focus }) }],
      schema: z.toJSONSchema(WorkerResultSchema, { target: "draft-7" }),
    },
    view,
  );
  const accepts = new Ajv({ strict: false }).compile(prepared.schema);
  const proposal = {
    intent: { schemaId: "pact.action.v1", payload: f.actions[0] },
    evidenceRefs: focus.sourceRefs,
    expectedOutcome: {},
    claims: (focus.observation.options as Data[])[0].claims,
    conflicts: [],
  };
  expect(accepts({ summary: "Choose quoted action", proposal })).toBe(true);
  expect(accepts({ summary: "Unsupported wait", proposal: null })).toBe(false);
  expect(
    accepts({
      summary: "Wait with reason",
      proposal: null,
      deferral: {
        reason: "risk_review",
        explanation: "Review current tradeoff.",
        reconsiderWhen: "Next stock review.",
      },
    }),
  ).toBe(true);
  expect(accepts({ summary: "Invented reference", proposal: { ...proposal, evidenceRefs: ["invented"] } })).toBe(false);
  expect(accepts({ summary: "Invented free action", proposal: { ...proposal, claims: [] } })).toBe(false);
});
it("refuses malformed or expired quote validity before producing a coordination frame", async () => {
  for (const value of ["invalid", "2026-10-24T23:59:59Z"]) {
    const f = fixture(),
      original = f.game.effects!.bind(f.game);
    f.game.effects = async (command) => ({ ...(await original(command)), validUntil: { clockId: "utc", value } });
    await expect(f.policy.observe(f.base)).rejects.toThrow("EXPIRED");
  }
});
it("empty or blocked native menus abstain without inventing an actionable focus or revision", async () => {
  const f = fixture();
  f.game.read = async () => ({
    schemaVersion: "pact.decision-support.v2",
    kingdomId: f.binding.entityRef,
    candidates: [
      {
        kind: "action",
        action: f.actions[0],
        checks: { admissionQuote: { admission: { blockers: ["BUILDING_ALREADY_QUEUED"] } } },
      },
    ],
  });
  const observation = await f.policy.observe(f.base);
  expect(observation.revision).toBe("native-revision");
  expect(observation.coordination?.focuses).toEqual([]);
});
it("quotes factual peer replies only for contacts actually present in the authorized view", async () => {
  const f = fixture(),
    peer = randomUUID();
  f.base.payload.guide = { contacts: [{ kingdomId: peer }] };
  const observation = await f.policy.observe(f.base);
  const focus = observation.coordination?.focuses.find((x) => x.id === "game.message.send");
  expect(focus).toBeDefined();
  if (!focus) throw Error("EXPECTED_NATIVE_MESSAGE_FOCUS");
  const payload = (focus.observation.options as Data[])[0].payload as Data;
  expect(payload.recipientKingdomId).toBe(peer);
  expect(payload.body).toContain("1000");
  expect(payload.body).not.toMatch(/delivered|completed|guarantee/i);
});

function proposalFor(f: ReturnType<typeof fixture>, view: Observation): Proposal {
  const option = (view.coordination!.focuses[0].observation.options as Data[])[0];
  return {
    taskId: "task",
    evidenceFrameRef: view.coordination!.evidenceFrameRef,
    intent: {
      commandId: randomUUID(),
      bindingId: f.binding.id,
      schemaId: "pact.action.v1",
      expectedVersion: view.revision,
      payload: option.payload as Data,
    },
    evidenceRefs: view.coordination!.focuses[0].sourceRefs,
    expectedOutcome: option.expectedOutcome as Data,
    claims: option.claims as Proposal["claims"],
    conflicts: [],
  };
}
it("retains the exact delivered frame when another observation reuses its native revision", async () => {
  const f = fixture();
  let evidence = "old";
  const effects = f.game.effects!;
  f.game.effects = async (command) => ({ ...(await effects(command)), sourceRefs: [`peer:${evidence}`] });
  const old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  evidence = "current";
  const current = await f.policy.observe(f.base);
  expect(current.revision).toBe(old.revision);
  const refreshed = await f.policy.refreshProposal(proposal, current);
  expect(refreshed.intent.commandId).toBe(proposal.intent.commandId);
  expect(refreshed.evidenceRefs).toEqual(["peer:current"]);
  expect(old.coordination!.evidenceFrameRef).not.toBe(current.coordination!.evidenceFrameRef);
  expect(refreshed.evidenceFrameRef).toBe(current.coordination!.evidenceFrameRef);
  expect(await f.policy.validate(refreshed, current)).toMatchObject({ valid: true });
  expect(await f.policy.execute(refreshed.intent)).toMatchObject({ code: "COMMITTED" });
  expect(f.counts().guarded).toBe(1);
  await expect(f.policy.execute(refreshed.intent)).rejects.toThrow("COORDINATION_VALIDATION_REQUIRED");
});
it("rejects foreign frame references and mixed citations without falling back to a native revision", async () => {
  const f = fixture(),
    old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  const current = await f.policy.observe(f.base);
  await expect(f.policy.refreshProposal({ ...proposal, evidenceFrameRef: randomUUID() }, current)).rejects.toThrow(
    "COORDINATION_ORIGIN_FRAME_UNAVAILABLE",
  );
  await expect(
    f.policy.refreshProposal({ ...proposal, evidenceRefs: [...proposal.evidenceRefs, "foreign"] }, current),
  ).rejects.toThrow("COORDINATION_REFERENCE_NOT_DELIVERED");
  expect(f.counts().guarded).toBe(0);
});
it("does not forget an intervening owner change or reinterpret an evicted frame", async () => {
  const f = fixture();
  f.base.payload.world = { ambition: "trade" };
  const old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  f.base.payload.world = { ambition: "defense" };
  await f.policy.observe(f.base);
  f.base.payload.world = { ambition: "trade" };
  const reverted = await f.policy.observe(f.base);
  await expect(f.policy.refreshProposal(proposal, reverted)).rejects.toThrow("COORDINATION_CHOICE_CHANGED");
  for (let i = 0; i < 16; i++) await f.policy.observe(f.base);
  await expect(f.policy.refreshProposal(proposal, reverted)).rejects.toThrow("COORDINATION_ORIGIN_FRAME_UNAVAILABLE");
});
it("refreshes unchanged semantic choices after clock/stock revisions while retaining exact command identity", async () => {
  const f = fixture(),
    old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  f.advance();
  const current = await f.policy.observe(f.base);
  const refreshed = await f.policy.refreshProposal(proposal, current);
  expect(refreshed.intent).toEqual({ ...proposal.intent, expectedVersion: current.revision });
  expect(refreshed.claims).toEqual(proposal.claims);
  expect(await f.policy.validate(refreshed, current)).toMatchObject({ valid: true });
  expect(await f.policy.execute(refreshed.intent)).toMatchObject({ code: "COMMITTED" });
});
it("refuses fresh admission when cost, choice, or original evidence changed", async () => {
  for (const change of ["cost", "choice", "evidence"] as const) {
    const f = fixture(),
      old = await f.policy.observe(f.base),
      proposal = proposalFor(f, old);
    f.advance();
    if (change === "cost") {
      const original = f.game.effects!;
      f.game.effects = async (c) => ({
        ...(await original(c)),
        claims: [{ kind: "resource", schemaId: "pact.stock.v1", key: "iron:founding", units: "6" }],
      });
    }
    if (change === "choice") f.actions[0] = { ...f.actions[0], targetLevel: 3 };
    if (change === "evidence") proposal.evidenceRefs = ["invented"];
    const current = await f.policy.observe(f.base);
    await expect(f.policy.refreshProposal(proposal, current)).rejects.toThrow(/COORDINATION_|CLAIMS_/);
    expect(f.counts().guarded).toBe(0);
  }
});
it("lets a worker compose text for an observed contact, then quotes that exact message", async () => {
  const f = fixture(),
    peer = randomUUID();
  f.base.payload.guide = { contacts: [{ kingdomId: peer }] };
  const view = await f.policy.observe(f.base),
    focus = view.coordination!.focuses.find((x) => x.id === "game.message.send")!;
  const option = (focus.observation.options as Data[])[0];
  const input = f.policy.grounding.prepare(
    {
      messages: [{ role: "user", content: JSON.stringify({ stage: "worker", focus }) }],
      schema: z.toJSONSchema(WorkerResultSchema, { target: "draft-7" }),
    },
    view,
  );
  const accepts = new Ajv({ strict: false }).compile(input.schema);
  const raw = {
    intent: {
      schemaId: "pact.action.v1",
      payload: {
        kind: "game.message.send",
        recipientKingdomId: peer,
        body: "Could we exchange grain for iron? What do you need?",
      },
    },
    evidenceRefs: focus.sourceRefs,
    expectedOutcome: option.expectedOutcome,
    claims: [],
    conflicts: [],
  };
  expect(accepts({ summary: "Ask a peer", proposal: raw })).toBe(true);
  expect(
    accepts({
      summary: "Invent peer",
      proposal: {
        ...raw,
        intent: { ...raw.intent, payload: { ...raw.intent.payload, recipientKingdomId: randomUUID() } },
      },
    }),
  ).toBe(false);
  const proposal = {
    ...raw,
    taskId: "task",
    evidenceFrameRef: view.coordination!.evidenceFrameRef,
    intent: { ...raw.intent, commandId: randomUUID(), bindingId: f.binding.id, expectedVersion: view.revision },
  } as Proposal;
  const admitted = await f.policy.refreshProposal(proposal, view);
  expect(admitted.intent.payload).toEqual(raw.intent.payload);
  expect(admitted.claims.length).toBeGreaterThan(0);
  expect(await f.policy.validate(admitted, view)).toMatchObject({ valid: true });
});
it.each([false, true])(
  "requires reconsideration when owner intent changes without a construction checkpoint (revision=%s)",
  async (advance) => {
    const f = fixture();
    f.base.payload.world = { ambition: "Discuss grain trade" };
    const old = await f.policy.observe(f.base),
      proposal = proposalFor(f, old);
    if (advance) f.advance();
    f.base.payload.world = { ambition: "Keep all resources for defense" };
    const current = await f.policy.observe(f.base);
    await expect(f.policy.refreshProposal(proposal, current)).rejects.toBeInstanceOf(ProposalRejection);
    await expect(f.policy.refreshProposal(proposal, current)).rejects.toMatchObject({
      feedback: { code: "COORDINATION_CHOICE_CHANGED", detail: { reason: "owner_intent_changed" } },
    });
  },
);

it("distinguishes a vanished current choice from an invalid original proposal", async () => {
  const f = fixture(),
    old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  f.actions[0] = { ...f.actions[0], targetLevel: 3 };
  const fresh = await f.policy.observe(f.base);
  await expect(f.policy.refreshProposal(proposal, fresh)).rejects.toMatchObject({
    feedback: { code: "COORDINATION_CHOICE_CHANGED", detail: { reason: "current_option_unavailable" } },
  });
  const forged = { ...proposal, expectedOutcome: { invented: true } };
  await expect(f.policy.refreshProposal(forged, fresh)).rejects.not.toBeInstanceOf(ProposalRejection);
  expect(f.counts().guarded).toBe(0);
});

it("requires a fresh proposal when construction changes its observed outcome basis", async () => {
  const f = fixture();
  const facts = JSON.parse(readFileSync("tests/fixtures/pact-initial-packing.json", "utf8")).observation.payload;
  facts.world.profile.kingdomId = f.binding.entityRef;
  f.base.payload = facts;
  const old = await f.policy.observe(f.base),
    proposal = proposalFor(f, old);
  expect(proposal.expectedOutcome.basis).toBeDefined();
  facts.world.buildings.find((b: Data) => b.kind === "barracks").level = 2;
  const fresh = await f.policy.observe(f.base);
  await expect(f.policy.refreshProposal(proposal, fresh)).rejects.toMatchObject({
    feedback: { code: "COORDINATION_CHOICE_CHANGED", detail: { reason: "expected_outcome_changed" } },
  });
  const reconsidered = proposalFor(f, fresh);
  expect(reconsidered.intent.commandId).not.toBe(proposal.intent.commandId);
  expect(reconsidered.expectedOutcome).not.toEqual(proposal.expectedOutcome);
  expect(await f.policy.refreshProposal(reconsidered, fresh)).toMatchObject(reconsidered);
  expect(f.counts().guarded).toBe(0);
});
