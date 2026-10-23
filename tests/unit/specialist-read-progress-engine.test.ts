import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { AutonomousSpecialistsEngine } from "../../src/engines/autonomous-specialists/engine.js";
import { pactReadQuerySchema } from "../../src/games/pact/read-queries.js";
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
  const observation = {
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
