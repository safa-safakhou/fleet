import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { FleetError, ProposalRejection } from "../../src/domain.js";
import { AutonomousSpecialistsEngine } from "../../src/engines/autonomous-specialists/engine.js";
import { pactActionContracts, validatePactProposal } from "../../src/games/pact/proposals.js";
import { pactReadQuerySchema } from "../../src/games/pact/read-queries.js";
import type { Observation } from "../../src/platform/contracts.js";
import type { ScopedOperation, ScopedServices } from "../../src/platform/engine-context.js";

const future = "Read requested; result not yet observed.";
const tool = {
  name: "fixture.status.read",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: { scope: { const: "self" } },
    required: ["scope"],
    additionalProperties: false,
  },
};
function setup(responses: unknown[]) {
  const observation: Observation = {
    schemaId: "fixture.observation.v1",
    revision: "1",
    observedAt: "2026-10-23T00:00:00Z",
    environmentTime: { clockId: "fixture.tick", value: "1" },
    sourceRefs: ["synthetic:current"],
    payload: { status: "not yet observed" },
    coverage: { authorizedView: true },
  };
  const observe = vi.fn(async () => observation),
    accept = vi.fn(),
    submit = vi.fn();
  let calls = 0;
  const services = {
    configuration: {
      budget: { maxCallsPerTurn: 3, maxOutputTokens: 1024, inputByteLimit: 24000 },
      architectureConfig: {
        decisionContract: "read-final.v3",
        readQueryContract: "environment.v4",
        responseContract: "visible.v1",
        learning: false,
        memoryBytes: 6000,
      },
      goal: "Read current owned status, then answer",
    },
    participants: {
      captureOriginal: async () => ({ id: randomUUID() }),
      load: async () => ({
        version: 1,
        charter: { id: "resources", allowedActions: [], maxActiveGoals: 8 },
        goals: [],
        memories: [],
        predictions: [],
        plan: null,
        coverage: {},
      }),
      inbox: async () => ({ records: [], omitted: 0 }),
      originals: async () => [],
      coordination: async () => ({}),
      accept,
    },
    environment: {
      schemas: { actions: [] },
      catalog: async () => [tool],
      readQuerySchema: async (options: { retrievedTool?: string }) =>
        pactReadQuerySchema([tool.name], true, options.retrievedTool === tool.name ? [tool] : [], [], 3),
      actionContracts: async () => [],
    },
    model: {
      remainingCalls: async () => 3 - calls,
      decide: async () => ({ decision: { decision: responses[calls++] }, inputTokens: 1, outputTokens: 1 }),
    },
    observe,
    actions: { submit },
    tasks: { waitForEvent: vi.fn() },
    trace: async () => {},
  } as unknown as ScopedServices;
  const operation: ScopedOperation = {
    id: randomUUID(),
    instanceId: "synthetic-progress",
    profile: { id: "autonomous-specialists", version: "1" },
    eventRefs: [],
    binding: {
      id: randomUUID(),
      environment: { id: "fixture", version: "1", instanceId: "synthetic-progress" },
      accountRef: "synthetic-owner",
      actorRef: "synthetic-agent",
      entityRef: "synthetic-service",
    },
    participantId: "resources",
    observation,
    task: { id: randomUUID(), key: "read-status", revision: 1, sourceCount: 1, sourceRefsOmitted: 0 },
    signal: new AbortController().signal,
  };
  return { services, operation, observe, accept, submit, calls: () => calls };
}
function actionFixture(summary: string, following: unknown[] = []) {
  const f = setup([
    { kind: "action", schemaId: "fixture.answer.v1", payload: { accept: true }, summary },
    ...following,
  ]);
  f.services.environment.schemas.actions = ["fixture.answer.v1"];
  f.services.environment.actionContracts = async () => [
    {
      schemaId: "fixture.answer.v1",
      payloadSchema: {
        type: "object",
        properties: { accept: { type: "boolean" } },
        required: ["accept"],
        additionalProperties: false,
      },
    },
  ];
  return f;
}
it("feeds back a proven unaccepted proposal within the original call budget", async () => {
  const f = actionFixture("Action proposed.", [
    { kind: "action", schemaId: "fixture.answer.v1", payload: { accept: false }, summary: "Action proposed." },
  ]);
  const requests: unknown[] = [],
    decide = f.services.model.decide;
  f.services.model.decide = async (request) => {
    requests.push(request);
    return decide(request);
  };
  f.accept
    .mockRejectedValueOnce(
      new ProposalRejection("RESOURCE_CLAIM_CONFLICT", "Use the quoted available stock.", {
        resourceRequirements: [{ requestedUnits: "8", remainingUnits: "2" }],
      }),
    )
    .mockResolvedValue({ accepted: true, version: 2 });
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(2);
  expect(JSON.stringify(requests[1])).toContain("RESOURCE_CLAIM_CONFLICT");
  expect(JSON.stringify(requests[1])).toContain("remainingUnits");
  expect(f.accept.mock.calls[1][0].intent.payload).toEqual({ accept: false });
  expect(f.submit).not.toHaveBeenCalled();
});
it("never retries a possibly accepted action based only on a generic error code", async () => {
  const f = actionFixture("Action proposed.");
  f.accept.mockRejectedValue(new FleetError("RESOURCE_CLAIM_CONFLICT", true));
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "RESOURCE_CLAIM_CONFLICT",
  );
  expect(f.calls()).toBe(1);
  expect(f.accept).toHaveBeenCalledTimes(1);
});
it("uses environment-provided correction without embedding domain rules in the engine", async () => {
  const f = actionFixture("Action proposed.", [
    { kind: "action", schemaId: "fixture.answer.v1", payload: { accept: false }, summary: "Action proposed." },
  ]);
  const validate = vi
    .fn()
    .mockResolvedValueOnce({
      valid: false,
      code: "FIXTURE_DIRECTION",
      correctable: true,
      guidance: "Reverse the selected direction.",
    })
    .mockResolvedValue({ valid: true, code: "VALID" });
  f.services.environment.validateProposal = validate;
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(2);
  expect(f.accept).toHaveBeenCalledTimes(1);
  expect(f.accept.mock.calls[0][0].intent.payload).toEqual({ accept: false });
});
it("carries a native excessive-bond rejection back through the engine before accepting corrected terms", async () => {
  const peer = "22222222-2222-4222-8222-222222222222";
  const facts = {
    world: { profile: { kingdomId: "11111111-1111-4111-8111-111111111111" } },
    diplomacy: {
      contractRules: {
        termsValidation: {
          schemaVersion: "pact.supply-terms.v1",
          maxBondFlowHours: 6,
          valueUnitsPerWhole: { grain: "1", iron: "4", silver: "8" },
          durationHours: [1, 6, 24, 72],
          noticeHours: [0, 1, 6],
          minOfferExpiryMinutes: 5,
          maxOfferExpiryMinutes: 60,
        },
      },
    },
  };
  const terms = {
    aToB: { resource: "grain", wholePerHour: 5 },
    bToA: { resource: "iron", wholePerHour: 6 },
    aBond: null,
    bBond: null,
    durationHours: 6,
    noticeHours: 1,
  };
  const good = { kind: "game.supply.offer", counterpartyKingdomId: peer, terms };
  const bad = { ...good, terms: { ...terms, aBond: { resource: "grain", wholeAmount: 31 } } };
  const decision = (payload: unknown) => ({
    kind: "action",
    schemaId: "pact.action.v1",
    payload,
    summary: "Action proposed.",
    expectedOutcome: { trade: { youSend: terms.aToB, youReceive: terms.bToA } },
  });
  const f = setup([decision(bad), decision(good)]);
  f.services.environment.schemas.actions = ["pact.action.v1"];
  f.services.environment.actionContracts = async () => pactActionContracts(facts, ["game.supply.offer"]);
  f.services.environment.validateProposal = async (p) =>
    validatePactProposal(p.intent.payload, facts, p.expectedOutcome);
  const requests: unknown[] = [],
    decide = f.services.model.decide;
  f.services.model.decide = async (request) => {
    requests.push(request);
    return decide(request);
  };
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(2);
  expect(JSON.stringify(requests[1])).toContain("PACT_SUPPLY_BOND_EXCEEDS_FLOW");
  expect(JSON.stringify(requests[1])).toContain("maxBondWhole");
  expect(f.accept).toHaveBeenCalledTimes(1);
  expect(f.accept.mock.calls[0][0].intent.payload).toEqual(good);
  expect(f.submit).not.toHaveBeenCalled();
});
it("stops unaccepted-proposal correction at the existing call limit", async () => {
  const next = {
    kind: "action",
    schemaId: "fixture.answer.v1",
    payload: { accept: false },
    summary: "Action proposed.",
  };
  const f = actionFixture("Action proposed.", [next, next]);
  f.accept.mockRejectedValue(new ProposalRejection("RESOURCE_CLAIM_CONFLICT", "Insufficient current capacity."));
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "RESOURCE_CLAIM_CONFLICT",
  );
  expect(f.calls()).toBe(3);
  expect(f.accept).toHaveBeenCalledTimes(3);
});
it("explains duplicate evidence support instead of reporting valid JSON as a generic model-output failure", async () => {
  const next = {
    kind: "action",
    schemaId: "fixture.answer.v1",
    payload: { accept: false },
    summary: "Action proposed.",
  };
  const f = actionFixture("Action proposed.", [next]),
    ref = randomUUID(),
    decide = f.services.model.decide;
  const requests: unknown[] = [];
  f.services.model.decide = async (request) => {
    requests.push(request);
    const result = await decide(request);
    return f.calls() === 1
      ? {
          ...result,
          decision: {
            ...(result.decision as object),
            update: {
              goals: [
                {
                  id: randomUUID(),
                  parentId: null,
                  objective: "Synthetic goal",
                  rationale: "Current need",
                  status: "active",
                  evidenceIds: [ref, ref],
                  assessment: "Still open",
                  wake: "Next update",
                },
              ],
              memories: [],
              predictions: [],
              plan: null,
              messages: [],
              wakeConditions: [],
            },
          },
        }
      : result;
  };
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(2);
  expect(JSON.stringify(requests[1])).toContain("DUPLICATE_EVIDENCE_REFERENCE");
  expect(f.accept).toHaveBeenCalledTimes(1);
});
it.each([{}, { select: [] }, { publish: [] }, { adopt: [] }, { select: [], publish: [], adopt: [] }])(
  "accepts an empty optional skill operation with skills disabled: %j",
  async (skills) => {
    const f = actionFixture("Action proposed."),
      decide = f.services.model.decide;
    f.services.model.decide = async (request) => {
      const result = await decide(request);
      return { ...result, decision: { ...(result.decision as object), skills } };
    };
    await new AutonomousSpecialistsEngine().run(f.operation, f.services);
    expect(f.calls()).toBe(1);
    expect(f.accept).toHaveBeenCalledTimes(1);
    expect(f.accept.mock.calls[0][0].intent.payload).toEqual({ accept: true });
  },
);
it("rejects the unsupported delivery guarantee before proposal validation or acceptance", async () => {
  const f = actionFixture(
    "Accept the incoming contact request. Response will be delivered to the sender's social attention.",
  );
  const validate = vi.fn(async () => ({ valid: true as const, code: "VALID" }));
  f.services.environment.validateProposal = validate;
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "ACTION_PROPOSAL_SUMMARY_REQUIRED",
  );
  expect(f.calls()).toBe(1);
  expect(validate).not.toHaveBeenCalled();
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});
it("accepts the neutral proposal summary without rewriting its selected action", async () => {
  const f = actionFixture("Action proposed.");
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.accept).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: expect.objectContaining({ schemaId: "fixture.answer.v1", payload: { accept: true } }),
    }),
  );
  expect(f.submit).not.toHaveBeenCalled();
});
it("keeps native proposal refusal authoritative with the neutral summary", async () => {
  const f = actionFixture("Action proposed.");
  f.services.environment.validateProposal = async () => ({ valid: false, code: "FIXTURE_AUTHORITY_DENIED" });
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "FIXTURE_AUTHORITY_DENIED",
  );
  expect(f.accept).not.toHaveBeenCalled();
});
it("preserves legacy action summaries", async () => {
  const f = actionFixture("Conditional legacy action plan");
  f.services.configuration.architectureConfig.decisionContract = "read-final.v2";
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.accept).toHaveBeenCalledTimes(1);
});
it.each([
  [{ kind: "read", query: {}, summary: future }, "EMPTY_REFRESH_FORBIDDEN"],
  [
    { kind: "read", query: { readSchema: tool.name }, summary: "observed the current status code" },
    "READ_RESULT_CLAIM_FORBIDDEN",
  ],
] as const)("rejects a schema-ignoring provider before any read or final persistence: %s", async (decision, code) => {
  const f = setup([decision]);
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(code);
  expect(f.calls()).toBe(1);
  expect(f.observe).not.toHaveBeenCalled();
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});
it("rejects a raw third read before its observation and without making a fourth call", async () => {
  const f = setup([
    { kind: "read", query: { continuity: true }, summary: future },
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "read", query: { tool: tool.name, args: { scope: "self" } }, summary: future },
  ]);
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "FINAL_DECISION_REQUIRED",
  );
  expect(f.calls()).toBe(3);
  expect(f.observe.mock.calls).toHaveLength(1);
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});

it("rejects the observed schema-lookup then goal-deferring wait before persistence", async () => {
  const f = setup([
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "wait", summary: "Observed: service status not yet observed", untilNextEvent: true },
  ]);
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow("SCOPED_READ_REQUIRED");
  expect(f.calls()).toBe(2);
  expect(f.observe).not.toHaveBeenCalled();
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});

it("allows a final wait after the selected scoped read has actually returned", async () => {
  const f = setup([
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "read", query: { tool: tool.name, args: { scope: "self" } }, summary: future },
    { kind: "wait", summary: "Scoped read returned; no action proposed" },
  ]);
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.observe.mock.calls).toHaveLength(1);
  expect(f.accept).toHaveBeenCalledTimes(1);
  expect(f.submit).not.toHaveBeenCalled();
});
it.each(["removed", "changed", "write-only"])(
  "releases a stale pending-read obligation when its catalog contract is %s",
  async (change) => {
    const f = setup([
      { kind: "read", query: { readSchema: tool.name }, summary: future },
      { kind: "wait", summary: "The selected read contract is no longer available" },
    ]);
    let catalogs = 0;
    f.services.environment.catalog = async () => {
      if (++catalogs === 1) return [tool];
      if (change === "removed") return [];
      return [
        {
          ...tool,
          ...(change === "write-only"
            ? { annotations: { readOnlyHint: false } }
            : { inputSchema: { ...tool.inputSchema, properties: { scope: { const: "changed" } } } }),
        },
      ];
    };
    await new AutonomousSpecialistsEngine().run(f.operation, f.services);
    expect(f.calls()).toBe(2);
    expect(f.observe).not.toHaveBeenCalled();
    expect(f.accept).toHaveBeenCalledTimes(1);
  },
);
it("preserves honest final waits when no read call remains", async () => {
  const f = setup([
    { kind: "read", query: { continuity: true }, summary: future },
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "wait", summary: "No read call remains; status is still unknown" },
  ]);
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(3);
  expect(f.accept).toHaveBeenCalledTimes(1);
  expect(f.submit).not.toHaveBeenCalled();
});
it("does not ban an initial wait or reinterpret legacy metadata inspection as an obligation", async () => {
  const initial = setup([{ kind: "wait", summary: "No selected scoped read" }]);
  await new AutonomousSpecialistsEngine().run(initial.operation, initial.services);
  expect(initial.accept).toHaveBeenCalledTimes(1);
  const legacy = setup([
    { kind: "read", query: { readSchema: tool.name }, summary: "Inspect metadata" },
    { kind: "wait", summary: "Metadata inspected" },
  ]);
  legacy.services.configuration.architectureConfig.decisionContract = "read-final.v2";
  await new AutonomousSpecialistsEngine().run(legacy.operation, legacy.services);
  expect(legacy.accept).toHaveBeenCalledTimes(1);
  expect(legacy.observe).not.toHaveBeenCalled();
});

it("blocks an initial wait for an unresolved trusted requested fact before any state acceptance", async () => {
  const f = setup([{ kind: "wait", summary: 'Observation available: service statusCode is "not yet observed".' }]);
  f.operation.observation.requestedFacts = [{ id: "service.statusCode", tool: tool.name, state: "unknown" }];
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow("SCOPED_READ_REQUIRED");
  expect(f.calls()).toBe(1);
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.observe).not.toHaveBeenCalled();
});
it("rejects a matching tool with different requested scope before its read", async () => {
  const f = setup([{ kind: "read", query: { tool: tool.name, args: { scope: "other" } }, summary: future }]);
  f.operation.observation.requestedFacts = [
    { id: "service.statusCode", tool: tool.name, args: { scope: "self" }, state: "unknown" },
  ];
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "SCOPED_READ_SCOPE_REQUIRED",
  );
  expect(f.observe).not.toHaveBeenCalled();
  expect(f.accept).not.toHaveBeenCalled();
});
it("rejects a placeholder value attached to an unknown requested fact before inference", async () => {
  const f = setup([]);
  f.operation.observation.requestedFacts = [
    { id: "service.statusCode", tool: tool.name, state: "unknown", value: "not yet observed" },
  ] as never;
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "REQUESTED_FACT_STATE_INVALID",
  );
  expect(f.calls()).toBe(0);
});

it("allows metadata then the matching read then an answer for a typed requested fact", async () => {
  const f = setup([
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "read", query: { tool: tool.name, args: { scope: "self" } }, summary: future },
    { kind: "wait", summary: 'Observed requested facts: [{"id":"service.statusCode","value":"ready"}]' },
  ]);
  f.operation.observation.requestedFacts = [{ id: "service.statusCode", tool: tool.name, state: "unknown" }];
  f.observe.mockImplementation(async () => ({
    ...f.operation.observation,
    requestedFacts: [{ id: "service.statusCode", tool: tool.name, state: "known", value: "ready" }],
  }));
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(3);
  expect(f.observe).toHaveBeenCalledTimes(1);
  expect(f.accept).toHaveBeenCalledTimes(1);
});
it("rejects the invented final provenance path even when the value is correct", async () => {
  const f = setup([
    {
      kind: "wait",
      summary: "Requested read of service.observation.service.requestedRead.statusCode resolved to 'violet-924'.",
    },
  ]);
  f.operation.observation.requestedFacts = [
    { id: "service.statusCode", tool: tool.name, state: "known", value: "violet-924" },
  ];
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "REQUESTED_FACT_SUMMARY_REQUIRED",
  );
  expect(f.accept).not.toHaveBeenCalled();
  expect(f.observe).not.toHaveBeenCalled();
});
it("rejects pretending a dropped requested fact became a completed answer", async () => {
  const f = setup([
    { kind: "read", query: { readSchema: tool.name }, summary: future },
    { kind: "read", query: { tool: tool.name, args: { scope: "self" } }, summary: future },
    { kind: "wait", summary: "Observed: service statusCode is not yet observed" },
  ]);
  f.operation.observation.requestedFacts = [{ id: "service.statusCode", tool: tool.name, state: "unknown" }];
  f.observe.mockImplementation(async () => ({ ...f.operation.observation, requestedFacts: undefined }));
  await expect(new AutonomousSpecialistsEngine().run(f.operation, f.services)).rejects.toThrow(
    "REQUESTED_FACT_WAIT_UNRESOLVED",
  );
  expect(f.accept).not.toHaveBeenCalled();
});
it.each(["unknown", "blocked"] as const)(
  "permits an honest unresolved wait for a %s fact without an available read",
  async (state) => {
    const f = setup([{ kind: "wait", summary: "Requested facts remain unresolved; no result is asserted." }]);
    f.operation.observation.requestedFacts = [
      {
        id: "service.statusCode",
        tool: tool.name,
        ...(state === "unknown" ? { state } : { state, code: "READ_UNAVAILABLE" }),
      },
    ];
    f.services.environment.catalog = async () => [];
    await new AutonomousSpecialistsEngine().run(f.operation, f.services);
    expect(f.calls()).toBe(1);
    expect(f.observe).not.toHaveBeenCalled();
    expect(f.accept).toHaveBeenCalledTimes(1);
  },
);
it("preserves a legitimately known literal value rather than guessing a sentinel phrase", async () => {
  const f = setup([
    { kind: "wait", summary: 'Observed requested facts: [{"id":"service.statusCode","value":"not yet observed"}]' },
  ]);
  f.operation.observation.requestedFacts = [
    { id: "service.statusCode", tool: tool.name, state: "known", value: "not yet observed" },
  ];
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.accept).toHaveBeenCalledTimes(1);
});
it("keeps the final-call reservation for a requested fact and reports it unresolved", async () => {
  const f = setup([{ kind: "wait", summary: "Requested facts remain unresolved; no result is asserted." }]);
  f.services.configuration.budget.maxCallsPerTurn = 1;
  f.operation.observation.requestedFacts = [{ id: "service.statusCode", tool: tool.name, state: "unknown" }];
  await new AutonomousSpecialistsEngine().run(f.operation, f.services);
  expect(f.calls()).toBe(1);
  expect(f.observe).not.toHaveBeenCalled();
  expect(f.accept).toHaveBeenCalledTimes(1);
});
