import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { afterEach, expect, it, vi } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ParticipantWork } from "../../src/app/participant-work.js";
import { transaction } from "../../src/db.js";
import type { Data } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";
import { LaunchService } from "../../src/platform/launch.js";
import { enableBoardEffects } from "../fixtures/environments/specialist-board.js";
import { candidate } from "../fixtures/skills/candidate.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await end?.();
  end = undefined;
});
async function setup(tokens = 100) {
  const f = await platformFixture(1);
  end = () => f.pool.end();
  enableBoardEffects(f.board, f.now, {
    startingTokens: tokens,
    tokensPerMove: tokens === 10 ? 6 : 1,
    ...(tokens === 10 ? { costBySquare: { a3: 4 } } : {}),
  });
  f.board.adapter.instructions = "Board instructions fixture: use only the current owned position.";
  f.board.adapter.accountObjective = (observation) => ({
    intent: "Owner board objective",
    currentState: { revision: observation.revision },
  });
  f.board.adapter.capabilities.events = "poll";
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    events: async (cursor) => ({ events: [], nextCursor: cursor, resyncRequired: false }),
  });
  f.board.adapter.specialistPresets = [
    {
      id: "resources-diplomacy",
      roles: ["resources", "diplomacy"].map((id) => ({
        charter: {
          id,
          revision: 1,
          responsibility: `Own ${id} goals on the board`,
          priority: 1,
          allowedActions: ["board.move.v1"],
          maxActiveGoals: 8,
        },
        subscriptions: {
          categories: id === "resources" ? ["resource", "result"] : ["offer"],
          periodic: false,
          version: "1",
        },
      })),
    },
    {
      id: "full",
      roles: ["resources", "diplomacy", "defense", "development"].map((id) => ({
        charter: {
          id,
          revision: 1,
          responsibility: `Own ${id} goals on the board`,
          priority: 1,
          allowedActions: ["board.move.v1"],
          maxActiveGoals: 8,
        },
        subscriptions: { categories: [id], periodic: false, version: "1" },
      })),
    },
  ];
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "autonomous-specialists", version: "1" });
  await f.pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
    f.group.id,
    { preset: "resources-diplomacy", maxActiveGoals: 8, memoryBytes: 6000 },
  ]);
  await f.store.consent(f.group.id, true);
  await f.store.setState(f.group.id, "running", true);
  const binding = f.group.bindings[0];
  const enqueue = (category: string, id = randomUUID()) =>
    transaction(f.pool, (db) =>
      f.tasks.publishWithin(
        db,
        binding,
        {
          id,
          type: "changed",
          sourceRef: `board:${id}`,
          observedAt: f.now().toISOString(),
          environmentTime: { clockId: "board.ply", value: String(f.board.executions) },
          metadata: { category, groupRef: category },
        },
        category,
      ),
    );
  return { ...f, binding, enqueue };
}
it("persists deferred proposals and gates real dispatch on bounded peer conflict without a coordinator", async () => {
  const f = await setup(10);
  let calls = 0;
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      const packet = JSON.parse(request.messages[1].content);
      calls++;
      if (calls > 1) expect(packet.coordination.proposals.length).toBeGreaterThan(0);
      return {
        decision: {
          decision: {
            kind: "action",
            schemaId: "board.move.v1",
            payload: { to: calls === 3 || calls === 5 ? "a3" : "a2" },
            summary: "Published plan",
            ...(calls === 1 || calls === 3 ? { defer: true } : {}),
          },
        },
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  };
  const run = async (category: string) => {
    const [id] = await f.enqueue(category);
    const claim = await f.tasks.claim("deferred", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
    f.advance(16 * 60000);
  };
  await run("resource");
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
  await expect(run("offer")).rejects.toThrow("PEER_REVISION_REQUIRED");
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT * FROM specialist_conflicts")).rows).toEqual([
    expect.objectContaining({ round: 0, status: "open" }),
  ]);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
  expect(calls).toBe(2);
  await run("resource");
  await run("offer");
  await run("resource");
  expect(calls).toBe(5);
  expect(f.board.executions).toBe(2);
  expect((await f.pool.query("SELECT * FROM specialist_conflicts")).rows).toEqual([
    expect.objectContaining({ round: 1, status: "resolved" }),
  ]);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(2);
});
it("extracts outcome-labelled advice only through accounted bounded learning and retrieves its compact index", async () => {
  const f = await setup();
  let calls = 0;
  let expectedEpisodes: string[] = [];
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      calls++;
      const packet = JSON.parse(request.messages[1].content);
      if (calls === 1)
        return {
          decision: {
            decision: {
              kind: "action",
              schemaId: "board.move.v1",
              payload: { to: "a2" },
              summary: "Observed board action",
            },
          },
          inputTokens: 10,
          outputTokens: 10,
        };
      if (calls === 2) {
        expect(packet.skills.opportunities[0].outcome).toBe("unproven");
        expectedEpisodes = packet.skills.opportunities[0].episodeIds;
        return {
          decision: {
            decision: { kind: "read", query: { skillSchema: true }, summary: "Low-priority repeated-work hypothesis" },
          },
          inputTokens: 10,
          outputTokens: 10,
        };
      }
      if (calls === 3) {
        const body = candidate(expectedEpisodes[0]);
        body.evidence.episodeIds = expectedEpisodes;
        body.evidence.claimedOutcome = "success";
        return {
          decision: {
            decision: { kind: "wait", summary: "Candidate persisted without experimentation" },
            proposals: [body],
          },
          inputTokens: 10,
          outputTokens: 10,
        };
      }
      expect(packet.skills.index).toHaveLength(1);
      expect(packet.skills.index[0]).toMatchObject({ status: "advisory", outcomeSupport: "unproven" });
      expect(packet.skills.index[0]).not.toHaveProperty("body");
      if (calls === 4)
        return {
          decision: {
            decision: { kind: "read", query: {}, summary: "Select a pinned relevant guide" },
            skills: { select: [packet.skills.index[0].ref] },
          },
          inputTokens: 10,
          outputTokens: 10,
        };
      expect(packet.skills.selected).toHaveLength(1);
      expect(
        packet.evidence.bundles
          .flatMap((b: { originals: { id: string }[] }) => b.originals)
          .map((o: { id: string }) => o.id),
      ).toEqual(expect.arrayContaining(packet.skills.selected[0].body.evidence.sourceIds));
      return {
        decision: { decision: { kind: "wait", summary: "I learned more (narrative only)" } },
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  };
  for (let i = 0; i < 3; i++) {
    const [id] = await f.enqueue("resource");
    const claim = await f.tasks.claim("learning", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
    f.advance(16 * 60000);
  }
  expect(calls).toBe(5);
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(5);
  const learning = (await f.pool.query("SELECT * FROM skill_learning_operations")).rows;
  expect(learning).toHaveLength(1);
  expect(learning[0].allocation_ids).toHaveLength(2);
  expect((await f.pool.query("SELECT status FROM skill_versions")).rows).toEqual([{ status: "advisory" }]);
});
it("keeps independent goals across events and restart and lets each specialist act without a coordinator", async () => {
  const f = await setup(),
    goals = { resources: randomUUID(), diplomacy: randomUUID() },
    memories = { resources: randomUUID(), diplomacy: randomUUID() },
    supports: Partial<Record<"resources" | "diplomacy", string>> = {},
    seen: string[] = [];
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      const packet = JSON.parse(request.messages[1].content),
        role = packet.specialist.id as keyof typeof goals;
      seen.push(role);
      expect(packet.specialist.charter.id).toBe(role);
      expect(packet.specialist.ownerIntent).toMatchObject({ intent: "Owner board objective" });
      expect(request.messages[0].content).toContain("Board instructions fixture");
      const source = packet.evidence.bundles
        .flatMap((b: { originals: { id: string; kind: string }[] }) => b.originals)
        .find((o: { kind: string }) => o.kind === "observation");
      expect(source?.id).toBeTruthy();
      if (packet.specialist.state.goals.length) {
        expect(packet.specialist.state.goals[0].id).toBe(goals[role]);
        expect(packet.evidence.deliveredIds).toEqual(expect.arrayContaining([memories[role], supports[role]]));
        expect(packet.evidence.deliveredIds).not.toContain(memories[role === "resources" ? "diplomacy" : "resources"]);
      } else supports[role] = source.id;
      const update = packet.specialist.state.goals.length
        ? undefined
        : {
            goals: [
              {
                id: goals[role],
                parentId: null,
                objective: `Persist ${role} objective`,
                rationale: "Owner board intent",
                status: "active",
                evidenceIds: [source.id],
                assessment: "Observe the next position",
                wake: "Relevant board event",
              },
            ],
            memories: [
              {
                id: memories[role],
                kind: "interpretation",
                text: "The initial observed owned square was a1",
                evidenceIds: [source.id],
                uncertainty: "Historical observation, not a claim about the current square",
              },
            ],
            predictions: [],
            plan: null,
            messages: [],
            wakeConditions: [],
          };
      return {
        decision: {
          decision: {
            kind: seen.length === 1 ? "wait" : "action",
            ...(seen.length === 1
              ? {}
              : { schemaId: "board.move.v1", payload: { to: role === "resources" ? "a2" : "a3" } }),
            summary: "Use only the current board goal",
          },
          ...(update ? { update } : {}),
        },
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
  for (const category of ["resource", "offer", "resource"]) {
    const [taskId] = await f.enqueue(category);
    const claim = await f.tasks.claim("specialist-fixture", f.now(), taskId);
    if (!claim) throw Error("CLAIM_REQUIRED");
    const runtime = f.host(model, undefined, {}, f.store.architectures);
    await runtime.host.run(claim);
    f.advance(16 * 60000);
  }
  expect(seen).toEqual(["resources", "diplomacy", "resources"]);
  expect(f.board.executions).toBe(2);
  const scope = {
      instanceId: `${f.binding.id}:autonomous-specialists@1`,
      bindingId: f.binding.id,
      specialistId: "resources",
    },
    repository = new SpecialistRepository(f.store, scope);
  expect((await repository.load(scope)).goals[0].id).toBe(goals.resources);
  expect((await repository.load({ ...scope, specialistId: "diplomacy" })).goals[0].id).toBe(goals.diplomacy);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(3);
});
it("does not wake specialists for unrelated events and keeps unsupported environments explicit", async () => {
  const f = await setup();
  expect(await f.enqueue("unrelated")).toEqual([]);
  expect((await f.pool.query("SELECT * FROM platform_tasks")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  const manifest = f.store.architectures.resolve({ id: "autonomous-specialists", version: "1" }).manifest;
  expect(manifest.requirements.capabilities.actionEffects).toBe(true);
  expect(new Set(f.store.architectures.list().map((m) => m.ref.id)).size).toBe(6);
});
it("routes scheduled reviews only to explicitly enrolled periodic roles", async () => {
  const f = await setup();
  const preset = f.board.adapter.specialistPresets?.[0];
  if (!preset) throw Error("PRESET_REQUIRED");
  preset.roles[0].subscriptions.periodic = true;
  await f.store.setState(f.group.id, "paused", true);
  await f.tasks.enroll(f.group.id, { id: "autonomous-specialists", version: "1" }, true);
  await f.store.setState(f.group.id, "running", true);
  const eligible = (
    await f.pool.query("SELECT count(*)::int n FROM agents WHERE cohort_id=$1 AND next_due_at<=$2", [
      f.group.id,
      f.now(),
    ])
  ).rows[0].n;
  await f.tasks.seedScheduled();
  expect(
    (await f.pool.query("SELECT participant_id FROM platform_tasks")).rows.every(
      (r) => r.participant_id === "resources",
    ),
  ).toBe(true);
  expect(eligible).toBeGreaterThan(0);
  expect((await f.pool.query("SELECT * FROM platform_tasks")).rowCount).toBe(eligible);
});
it("reports missing consent and adapter presets in launch readiness before any inference", async () => {
  const f = await setup(),
    cohort = await f.store.cohort(f.group.id);
  const launcher = new LaunchService(f.store, f.tasks, f.environments, f.store.architectures, {
    liveAllowed: false,
    providerConfigured: () => true,
  });
  const agents = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [cohort.id])).rows;
  const spec = {
    architecture: { id: "autonomous-specialists", version: "1" },
    environment: f.binding.environment,
    architectureConfig: { preset: "resources-diplomacy", maxActiveGoals: 8, memoryBytes: 6000 },
    model: cohort.model,
    budget: cohort.budget,
    accounts: { agentIds: agents.map((a) => a.id) },
  };
  await f.store.consent(cohort.id, false);
  expect((await launcher.check(spec)).checks.some((c) => c.code === "CONSENT_REQUIRED")).toBe(true);
  await f.store.consent(cohort.id, true);
  f.board.adapter.specialistPresets = [];
  expect((await launcher.check(spec)).checks.some((c) => c.code === "SPECIALIST_PRESET_REQUIRED")).toBe(true);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("wakes a durable UTC deadline without another model call and respects paused cohorts", async () => {
  const f = await setup(),
    [taskId] = await f.enqueue("resource"),
    claim = await f.tasks.claim("specialist-wait", f.now(), taskId);
  if (!claim) throw Error("CLAIM_REQUIRED");
  const model = {
    decide: async () => ({
      decision: {
        decision: { kind: "wait", untilNextEvent: true, summary: "Review the persisted deadline" },
        update: {
          goals: [],
          memories: [],
          predictions: [],
          plan: null,
          messages: [],
          wakeConditions: [
            { kind: "deadline", at: { clockId: "utc", value: new Date(f.now().getTime() + 60000).toISOString() } },
          ],
        },
      },
      inputTokens: 100,
      outputTokens: 50,
    }),
  };
  const runtime = f.host(model, undefined, {}, f.store.architectures);
  await runtime.host.run(claim);
  const work = new ParticipantWork({
    store: f.store,
    tasks: f.tasks,
    bindings: f.bindings,
    environments: f.environments,
    commands: runtime.commands,
    enabled: () => true,
  });
  f.advance(60000);
  await f.store.setState(f.group.id, "paused", true);
  expect(await work.tick({ admissionOpen: true, signal: new AbortController().signal })).toBe(0);
  await f.store.setState(f.group.id, "running", true);
  await work.tick({ admissionOpen: true, signal: new AbortController().signal });
  expect((await f.pool.query("SELECT * FROM specialist_wakes WHERE status='ready'")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM turns")).rowCount).toBe(1);
});
it("completes a goal only from a registered condition observed after the actual action", async () => {
  const f = await setup(),
    goalId = randomUUID();
  let calls = 0;
  f.board.adapter.conditionContracts = [
    {
      name: "at_square",
      version: "1",
      description: "Observed owned square equals the target",
      argsSchema: {
        type: "object",
        properties: { to: { type: "string" } },
        required: ["to"],
        additionalProperties: false,
      },
    },
  ];
  f.board.adapter.wakePredicates = new Map([
    ["at_square@1", (args, facts) => (typeof args.to === "string" ? facts.square === args.to : undefined)],
  ]);
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      calls++;
      const packet = JSON.parse(request.messages[1].content);
      expect(packet.specialist.assessmentConditions[0].name).toBe("at_square");
      const evidenceId = packet.evidence.bundles.flatMap((b: { originals: { id: string }[] }) => b.originals)[0].id;
      return {
        decision: {
          decision:
            calls === 1
              ? {
                  kind: "action",
                  schemaId: "board.move.v1",
                  payload: { to: "a2" },
                  summary: "Move toward the observable goal",
                }
              : { kind: "wait", summary: "The actual observed square satisfies the goal" },
          update: {
            goals: [
              {
                id: goalId,
                parentId: null,
                objective: "Reach a2",
                rationale: "Owner board objective",
                status: calls === 1 ? "active" : "completed",
                evidenceIds: [evidenceId],
                assessment: "Observe the actual square",
                assessmentCondition: { name: "at_square", version: "1", args: { to: "a2" } },
                wake: "Position change",
              },
            ],
            memories: [],
            predictions: [],
            plan: null,
            messages: [],
            wakeConditions: [],
          },
        },
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
  for (let i = 0; i < 2; i++) {
    const [id] = await f.enqueue("resource"),
      claim = await f.tasks.claim("goal-fixture", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
    f.advance(16 * 60000);
  }
  const scope = {
    instanceId: `${f.binding.id}:autonomous-specialists@1`,
    bindingId: f.binding.id,
    specialistId: "resources",
  };
  expect((await new SpecialistRepository(f.store, scope).load(scope)).goals[0].status).toBe("completed");
  expect(f.board.executions).toBe(1);
});
it("rejects an unobserved completion claim before the proposed action is submitted", async () => {
  const f = await setup();
  f.board.adapter.wakePredicates = new Map([["at_square@1", (args, facts) => facts.square === args.to]]);
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      const packet = JSON.parse(request.messages[1].content),
        evidenceId = packet.evidence.bundles[0].originals[0].id;
      return {
        decision: {
          decision: {
            kind: "action",
            schemaId: "board.move.v1",
            payload: { to: "a2" },
            summary: "Incorrectly claim the future action is already complete",
          },
          update: {
            goals: [
              {
                id: randomUUID(),
                parentId: null,
                objective: "Reach a2",
                rationale: "Owner board objective",
                status: "completed",
                evidenceIds: [evidenceId],
                assessment: "Observe actual square",
                assessmentCondition: { name: "at_square", version: "1", args: { to: "a2" } },
                wake: "Position change",
              },
            ],
            memories: [],
            predictions: [],
            plan: null,
            messages: [],
            wakeConditions: [],
          },
        },
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("goal-rejection", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(
    "GOAL_OUTCOME_REQUIRED",
  );
  expect(f.board.executions).toBe(0);
});
it("runs the four-role adapter preset with separate decisions and one canonical action lane", async () => {
  const f = await setup(),
    seen: string[] = [];
  await f.pool.query("UPDATE cohort_engine_profiles SET architecture_config=$2 WHERE cohort_id=$1", [
    f.group.id,
    { preset: "full", maxActiveGoals: 8, memoryBytes: 6000 },
  ]);
  const model = {
    decide: async (request: { messages: { content: string }[] }) => {
      const packet = JSON.parse(request.messages[1].content);
      seen.push(packet.specialist.id);
      return {
        decision: {
          decision: {
            kind: "action",
            schemaId: "board.move.v1",
            payload: { to: `a${seen.length + 1}` },
            summary: "Use this specialist's permitted board action",
          },
        },
        inputTokens: 100,
        outputTokens: 50,
      };
    },
  };
  for (const category of ["resources", "diplomacy", "defense", "development"]) {
    const [id] = await f.enqueue(category),
      claim = await f.tasks.claim("four-specialists", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
    f.advance(16 * 60000);
  }
  expect(seen).toEqual(["resources", "diplomacy", "defense", "development"]);
  expect(f.board.executions).toBe(4);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(4);
  expect((await f.pool.query("SELECT mode FROM architecture_operations")).rows.every((r) => r.mode === "serial")).toBe(
    true,
  );
});
it("does not guess a foreign adapter observation policy", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => ({
    ...(await connect(binding)),
    projectObservation: () => {
      throw Error("UNADVERTISED_POLICY");
    },
  });
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("foreign-policy", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await f
    .host(
      {
        decide: async () => ({
          decision: { decision: { kind: "wait", summary: "Own small board observation" } },
          inputTokens: 10,
          outputTokens: 10,
        }),
      },
      undefined,
      {},
      f.store.architectures,
    )
    .host.run(claim);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(1);
  expect(f.board.executions).toBe(0);
});

it.each([false, true])(
  "delivers an injected read contract only for the explicit candidate setting enabled=%s",
  async (enabled) => {
    const f = await setup();
    if (enabled)
      await f.pool.query(
        "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
        [f.group.id, { readQueryContract: "environment.v1" }],
      );
    const readQuerySchema = {
      description: "Inspect an advertised square in the current authorized board position.",
      type: "object",
      properties: { square: { enum: ["a1", "a2"] } },
      required: ["square"],
      additionalProperties: false,
    };
    const connect = f.board.adapter.connect;
    f.board.adapter.connect = async (binding) => ({
      ...(await connect(binding)),
      readQuerySchema: async () => readQuerySchema,
    });
    let delivered = false;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      const packet = JSON.parse(request.messages[1].content);
      if (enabled) {
        expect(packet.readInterface).toBeDefined();
        const contract = packet.readInterface.querySchema;
        expect(JSON.stringify(contract)).toContain(readQuerySchema.description);
        const acceptsQuery = new Ajv({ strict: false }).compile(contract);
        expect(acceptsQuery({ square: "a2" })).toBe(true);
        expect(acceptsQuery({ document: "review" })).toBe(false);
        expect(acceptsQuery({ tool: "pact_world_read_v1", args: {} })).toBe(false);
        expect(acceptsQuery({ skillSchema: true })).toBe(packet.skills !== null);
      } else expect(packet).not.toHaveProperty("readInterface");
      const accepts = new Ajv({ strict: false, validateFormats: false }).compile(request.format);
      const read = (query: Data) => ({ decision: { kind: "read", query, summary: "Inspect the current board" } });
      expect(accepts(read({ square: "a2" }))).toBe(true);
      expect(accepts(read({ document: "review" }))).toBe(!enabled);
      expect(accepts(read({ tool: "pact_world_read_v1", args: {} }))).toBe(!enabled);
      expect(
        Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.format)),
      ).toBeLessThanOrEqual(claim?.turn.cohort.budget?.inputByteLimit ?? 0);
      delivered = true;
      return new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({ decision: { kind: "wait", summary: "No board change needed" } }),
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 10,
        }),
      );
    });
    const model = new HttpModel({ ollama: "http://provider.invalid" }, undefined);
    const [id] = await f.enqueue("resource");
    const claim = await f.tasks.claim("read-contract", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
    expect(delivered).toBe(true);
    expect(f.board.executions).toBe(0);
  },
);

it("counts the prompt copy of the read contract before admitting any model dispatch", async () => {
  const f = await setup();
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { readQueryContract: "environment.v1" }],
  );
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => ({
    ...(await connect(binding)),
    readQuerySchema: async () => ({
      description: "x".repeat(12000),
      type: "object",
      properties: { square: { type: "string" } },
      required: ["square"],
      additionalProperties: false,
    }),
  });
  let calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return new Response(
      JSON.stringify({
        message: {
          role: "assistant",
          content: JSON.stringify({ decision: { kind: "wait", summary: "No board change needed" } }),
        },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 10,
      }),
    );
  });
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("oversized-read-contract", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(
    f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim),
  ).rejects.toThrow("SPECIALIST_CONTEXT_INCOMPLETE");
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});

it("refuses an explicit read-contract candidate when its environment supplies no contract", async () => {
  const f = await setup();
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { readQueryContract: "environment.v1" }],
  );
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return { decision: { decision: { kind: "wait", summary: "No action" } }, inputTokens: 10, outputTokens: 10 };
    },
  };
  const [id] = await f.enqueue("resource");
  const claim = await f.tasks.claim("missing-read-contract", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(
    "READ_QUERY_CONTRACT_REQUIRED",
  );
  expect(calls).toBe(0);
});

it.each([false, true, "direction"] as const)(
  "keeps owner intent opaque and separates permissions in the serialized prompt only when enabled=%s",
  async (enabled) => {
    const f = await setup();
    const ownerIntent = '{"receive":"tokens","minimumReceivePerHour":1,"maximumSendPerHour":4}';
    f.board.adapter.accountObjective = () => ownerIntent;
    if (enabled)
      await f.pool.query(
        "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
        [f.group.id, { intentAuthorityContract: enabled === "direction" ? "separate.v3" : "separate.v1" }],
      );
    let calls = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls++;
      const request = JSON.parse(String(init.body)),
        packet = JSON.parse(request.messages[1].content);
      expect(packet.specialist.ownerIntent).toBe(ownerIntent);
      if (enabled) {
        expect(packet.intentAuthority).toMatchObject({
          ownerIntent: "Objective/preferences, not an authorization grant.",
          limits:
            enabled === "direction"
              ? "Keep each objective limit's domain, direction, unit and clock; outgoing maxima do not cap incoming rates or grant action allowances."
              : "Numeric objective limits keep their stated domain, unit and clock. Never convert them into unrelated action allowances.",
          permissions:
            "Use current authorized environment facts. An unstated action allowance is unknown; use supported reads.",
        });
        expect(JSON.stringify(packet.intentAuthority)).not.toContain("PACT");
      } else expect(packet).not.toHaveProperty("intentAuthority");
      expect(
        Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.format)),
      ).toBeLessThanOrEqual(claim?.turn.cohort.budget?.inputByteLimit ?? 0);
      return new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({ decision: { kind: "wait", summary: "No numeric permission is claimed." } }),
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 10,
        }),
      );
    });
    const [id] = await f.enqueue("resource"),
      claim = await f.tasks.claim("intent-authority", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim);
    expect(calls).toBe(1);
    expect(f.board.executions).toBe(0);
  },
);

it.each([false, true, "temporal", "semantics", "clock", "decision"] as const)(
  "binds native participant shapes and prompt scope in actual HTTP generation enabled=%s",
  async (enabled) => {
    const f = await setup();
    f.board.adapter.observationSemantics = "Synthetic: stock is tokens; income is arriving tokens per turn.";
    f.board.adapter.observationSemanticsFor = () => "Unused v2 callback; v1 must stay verbatim";
    if (enabled === "decision") {
      const connect = f.board.adapter.connect;
      f.board.adapter.connect = async (binding) => ({
        ...(await connect(binding)),
        readQuerySchema: async () => ({
          description: "Synthetic read documentation retained in the prompt",
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
      });
    }
    if (enabled)
      await f.pool.query(
        "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
        [
          f.group.id,
          {
            participantContract: "scoped.v1",
            ...(enabled === "temporal" || enabled === "semantics" || enabled === "clock" || enabled === "decision"
              ? { temporalEvidenceContract: "bounded.v1" }
              : {}),
            ...(enabled === "semantics" || enabled === "clock" || enabled === "decision"
              ? { observationContract: "semantics.v1" }
              : {}),
            ...(enabled === "clock" || enabled === "decision" ? { clockContract: "scoped.v1" } : {}),
            ...(enabled === "decision"
              ? { decisionContract: "read-final.v1", readQueryContract: "environment.v1" }
              : {}),
          },
        ],
      );
    let calls = 0;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls++;
      const request = JSON.parse(String(init.body)),
        packet = JSON.parse(request.messages[1].content),
        accepts = new Ajv({ strict: false, validateFormats: false }).compile(request.format);
      const parent = packet.inbox.records.find((r: { event: unknown; depth: number }) => r.event && r.depth < 4)?.id;
      expect(parent).toBeTruthy();
      const evidence = packet.evidence.deliveredIds[0],
        foreign = "33333333-3333-4333-8333-333333333333";
      const update = {
        goals: [],
        memories: [],
        predictions: [],
        plan: null,
        messages: [
          {
            to: "diplomacy",
            kind: "publish",
            text: "Current input only",
            parentDeliveryId: parent,
            evidenceIds: [evidence],
          },
        ],
        wakeConditions: [{ kind: "event", category: "resource" }],
      };
      const wrap = (u: unknown) => ({
        decision: { kind: "wait", summary: "No new permission or delivery claimed" },
        update: u,
      });
      expect(accepts(wrap(update))).toBe(true);
      expect(accepts(wrap({ ...update, messages: [{ ...update.messages[0], parentDeliveryId: foreign }] }))).toBe(
        !enabled,
      );
      expect(accepts(wrap({ ...update, messages: [{ ...update.messages[0], to: "resources" }] }))).toBe(!enabled);
      expect(
        accepts(
          wrap({
            ...update,
            wakeConditions: [{ type: "offer", sourceRef: "invented", observedAt: "2026-10-22T19:00:00Z" }],
          }),
        ),
      ).toBe(!enabled);
      expect(
        accepts(wrap({ ...update, wakeConditions: [{ kind: "event", category: "invented_future_decision" }] })),
      ).toBe(enabled !== "temporal" && enabled !== "semantics" && enabled !== "clock" && enabled !== "decision");
      if (enabled === "temporal" || enabled === "semantics" || enabled === "clock" || enabled === "decision")
        expect(packet.participantInterface.temporalEvidence).toContain("never their promises");
      if (enabled === "semantics" || enabled === "clock" || enabled === "decision")
        expect(packet.observationSemantics).toBe(f.board.adapter.observationSemantics);
      else expect(packet).not.toHaveProperty("observationSemantics");
      const readOnly = { decision: { kind: "read", query: {}, summary: "Read only" } };
      expect(accepts(readOnly)).toBe(true);
      expect(accepts({ ...readOnly, update })).toBe(enabled !== "decision");
      if (enabled === "decision") {
        expect(packet.readInterface.meaning).toContain("provenance");
        expect(JSON.stringify(packet.readInterface.querySchema)).toContain(
          "Synthetic read documentation retained in the prompt",
        );
        expect(JSON.stringify(request.format)).not.toContain("Synthetic read documentation retained in the prompt");
      }
      const timed = (at: unknown) => wrap({ ...update, wakeConditions: [{ kind: "periodic", at }] });
      expect(accepts(timed({ clockId: "utc", value: "}" }))).toBe(enabled !== "clock" && enabled !== "decision");
      expect(accepts(timed({ clockId: "utc", value: "2026-10-22T23:00:00Z" }))).toBe(true);
      if (enabled === "clock" || enabled === "decision") expect(packet.participantInterface.wakes).toContain("UTC");
      if (enabled) {
        expect(packet.participantInterface.parentDeliveryIds).toContain(parent);
        expect(packet.participantInterface.recipients).toContain("diplomacy");
        expect(packet.participantInterface.recipients).not.toContain("resources");
      } else expect(packet).not.toHaveProperty("participantInterface");
      return new Response(
        JSON.stringify({
          message: {
            role: "assistant",
            content: JSON.stringify({ decision: { kind: "wait", summary: "No update required" } }),
          },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 10,
        }),
      );
    });
    const [id] = await f.enqueue("resource"),
      claim = await f.tasks.claim("participant-contract", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim);
    expect(calls).toBe(1);
    expect(f.board.executions).toBe(0);
  },
);

it.each([
  { name: "missing", semantics: undefined },
  { name: "empty", semantics: "" },
  { name: "oversized", semantics: "x".repeat(2049) },
])("refuses $name opted-in observation semantics before model admission", async ({ semantics }) => {
  const f = await setup();
  f.board.adapter.observationSemantics = semantics;
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { observationContract: "semantics.v1" }],
  );
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return { decision: { decision: { kind: "wait", summary: "No action" } }, inputTokens: 10, outputTokens: 10 };
    },
  };
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("missing-observation-semantics", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(
    "OBSERVATION_SEMANTICS_REQUIRED",
  );
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it.each([
  { config: { clockContract: "scoped.v1" }, code: "CLOCK_PARTICIPANT_CONTRACT_REQUIRED" },
  { config: { responseContract: "visible.v1" }, code: "RESPONSE_READ_CONTRACT_REQUIRED" },
  { config: { observationPolicyVersion: "2" }, code: "SPECIALIST_OBSERVATION_POLICY_REQUIRED" },
  { config: { skillReferenceContract: "listed.v1" }, code: "SKILL_REFERENCE_DECISION_CONTRACT_REQUIRED" },
  { config: { goalReferenceContract: "scoped.v1" }, code: "GOAL_REFERENCE_PARTICIPANT_CONTRACT_REQUIRED" },
])("requires profile prerequisites before scoped generation %j", async ({ config, code }) => {
  const f = await setup();
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, config],
  );
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return { decision: { decision: { kind: "wait", summary: "No action" } }, inputTokens: 10, outputTokens: 10 };
    },
  };
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("missing-scoped-participant", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(code);
  expect(calls).toBe(0);
});
it.each([false, true, "named", "skills"] as const)(
  "delivers current named meanings and scoped response contracts after an actual read visible=%s",
  async (visible) => {
    const f = await setup(),
      seen: string[] = [];
    let currentGross = "10";
    const named = visible === "named" || visible === "skills";
    const skillRefs = visible === "skills";
    if (named) {
      f.board.adapter.specialistObservationPolicy = { id: "board", version: "1" };
      f.board.adapter.specialistObservationPolicies = [{ id: "board", version: "2" }];
    }
    const actionContracts = async () => [
      {
        schemaId: "board.move.v1",
        payloadSchema: {
          type: "object",
          properties: { to: { const: currentGross === "10" ? "a2" : "a3" } },
          required: ["to"],
          additionalProperties: false,
        },
      },
    ];
    f.board.adapter.observationSemantics = "Static v1 is not a v2 fallback";
    f.board.adapter.observationSemanticsFor = (o) => `Current local gross=${o.payload.gross}`;
    const connect = f.board.adapter.connect;
    f.board.adapter.connect = async (binding) => {
      const session = await connect(binding);
      return {
        ...session,
        actionContracts,
        ...(named
          ? {
              projectObservation: (
                o: import("../../src/platform/contracts.js").Observation,
                policy: { id: string; version: string },
              ) => {
                expect(policy).toEqual({ id: "board", version: "2" });
                return { ...o, schemaId: "board.position.v2" };
              },
            }
          : {}),
        observe: async (query) => {
          const observation = await session.observe(query);
          return { ...observation, payload: { ...observation.payload, gross: currentGross } };
        },
        readQuerySchema: async () => ({ type: "object", properties: {}, additionalProperties: false }),
      };
    };
    await f.pool.query(
      "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
      [
        f.group.id,
        {
          observationContract: "semantics.v2",
          readQueryContract: "environment.v1",
          ...(named ? { observationPolicyVersion: "2", intentAuthorityContract: "separate.v2" } : {}),
          ...(skillRefs ? { skillReferenceContract: "listed.v1", decisionContract: "read-final.v1" } : {}),
          ...(visible
            ? { responseContract: "visible.v1", clockContract: "scoped.v2", participantContract: "scoped.v1" }
            : {}),
        },
      ],
    );
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const b = JSON.parse(String(init.body)),
        packet = JSON.parse(b.messages[1].content);
      expect(packet.observationSemantics).toBe(`Current local gross=${packet.observation.payload.gross}`);
      if (named) {
        expect(packet.observation.schemaId).toBe("board.position.v2");
        expect(packet.intentAuthority.ownerIntent).toContain("not an authorization grant");
      }
      if (visible) {
        const text = JSON.stringify(packet.responseInterface);
        expect(text).toContain(currentGross === "10" ? "a2" : "a3");
        expect(text).not.toContain(currentGross === "10" ? "a3" : "a2");
        expect(text).toContain("readInterface.queryShape");
        expect(JSON.stringify(b.format)).toContain("[0-9]{1,40}");
      } else expect(packet.responseInterface).toBeUndefined();
      seen.push(packet.observationSemantics);
      if (seen.length === 1) currentGross = "20";
      return Response.json({
        message: {
          content: JSON.stringify({
            ...(skillRefs ? { skills: seen.length === 1 ? { select: [] } : { publish: [], adopt: [] } } : {}),
            decision:
              seen.length === 1
                ? { kind: "read", query: {}, summary: "Refresh current facts" }
                : { kind: "wait", summary: "Current facts reviewed" },
          }),
        },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 10,
      });
    });
    const [id] = await f.enqueue("resource"),
      claim = await f.tasks.claim("named-current-facts", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim);
    expect(seen).toHaveLength(2);
    expect(seen).toEqual(["Current local gross=10", "Current local gross=20"]);
    expect(f.board.executions).toBe(0);
  },
);
it.each(["missing", "empty", "oversized"])("refuses %s v2 meanings without substituting a v1 string", async (kind) => {
  const f = await setup();
  f.board.adapter.observationSemantics = "Valid static v1";
  f.board.adapter.observationSemanticsFor =
    kind === "missing" ? undefined : () => (kind === "empty" ? "" : "x".repeat(2049));
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { observationContract: "semantics.v2" }],
  );
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return { decision: { decision: { kind: "wait", summary: "No action" } }, inputTokens: 10, outputTokens: 10 };
    },
  };
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("invalid-named-facts", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(
    "OBSERVATION_SEMANTICS_REQUIRED",
  );
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("rejects unlisted skill responses through bounded recovery before any requested read", async () => {
  const f = await setup();
  let probes = 0,
    calls = 0;
  const connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => {
    const session = await connect(binding);
    return {
      ...session,
      readQuerySchema: async () => ({
        type: "object",
        properties: { probe: { const: true } },
        additionalProperties: false,
      }),
      observe: async (query) => {
        if (query.probe === true) probes++;
        return session.observe(query);
      },
    };
  };
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [
      f.group.id,
      { skillReferenceContract: "listed.v1", decisionContract: "read-final.v1", readQueryContract: "environment.v1" },
    ],
  );
  vi.stubGlobal("fetch", async () => {
    calls++;
    return Response.json({
      message: {
        content: JSON.stringify({
          decision: { kind: "read", query: { probe: true }, summary: "Read current authorized facts" },
          skills: { select: [{ id: "123e4567-e89b-42d3-a456-426614174000", version: 1, digest: "a".repeat(64) }] },
        }),
      },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 10,
      eval_count: 10,
    });
  });
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("unlisted-skill", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await expect(
    f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim),
  ).rejects.toThrow("INVALID_MODEL_OUTPUT");
  expect(calls).toBe(2);
  expect(probes).toBe(0);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([
    { status: "reported" },
    { status: "reported" },
  ]);
});

it.each([false, true])(
  "resolves scoped goal parents through HTTP and refuses cycles before persistence cycle=%s",
  async (cycle) => {
    const f = await setup(),
      child = randomUUID(),
      parent = randomUUID();
    let calls = 0;
    await f.pool.query(
      "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
      [
        f.group.id,
        { participantContract: "scoped.v1", decisionContract: "read-final.v1", goalReferenceContract: "scoped.v1" },
      ],
    );
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      const wire = JSON.parse(String(init.body)),
        packet = JSON.parse(wire.messages[1].content);
      calls++;
      const source = packet.evidence.deliveredIds[0];
      expect(source).toBeTypeOf("string");
      const goal = (id: string, parentId: unknown) => ({
        id,
        parentId,
        objective: "Observe current board facts",
        rationale: "Current scoped board evidence",
        status: "active",
        evidenceIds: [source],
        assessment: "Read actual position",
        wake: "Review changed evidence",
      });
      const response = {
        decision: { kind: "wait", summary: "No board effect or completion claimed" },
        update: {
          goals:
            calls === 1
              ? [goal(child, { goalIndex: 1 }), goal(parent, cycle ? { goalIndex: 0 } : null)]
              : [goal(child, parent)],
          memories: [],
          predictions: [],
          plan: null,
          messages: [],
          wakeConditions: [],
        },
      };
      const v = new Ajv({ strict: false, validateFormats: false }).compile(wire.format);
      expect(v(response), JSON.stringify(v.errors)).toBe(true);
      expect(v({ ...response, update: { ...response.update, goals: [goal(child, packet.inbox.records[0].id)] } })).toBe(
        false,
      );
      return Response.json({
        message: { content: JSON.stringify(response) },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 10,
      });
    });
    const run = async () => {
      const [id] = await f.enqueue("resource"),
        claim = await f.tasks.claim("scoped-goal-parents", f.now(), id);
      if (!claim) throw Error("CLAIM_REQUIRED");
      return f
        .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
        .host.run(claim);
    };
    const scope = {
      instanceId: `${f.binding.id}:autonomous-specialists@1`,
      bindingId: f.binding.id,
      specialistId: "resources",
    };
    if (cycle) {
      await expect(run()).rejects.toThrow("GOAL_CYCLE");
      expect((await new SpecialistRepository(f.store, scope).load(scope)).goals).toEqual([]);
      expect(calls).toBe(1);
    } else {
      await run();
      let goals = (await new SpecialistRepository(f.store, scope).load(scope)).goals;
      expect(goals.find((g) => g.id === child)?.parentId).toBe(parent);
      expect(goals.find((g) => g.id === parent)?.parentId).toBe(null);
      f.advance(16 * 60000);
      await run();
      goals = (await new SpecialistRepository(f.store, scope).load(scope)).goals;
      expect(goals.find((g) => g.id === child)?.parentId).toBe(parent);
      expect(calls).toBe(2);
    }
    expect(f.board.executions).toBe(0);
    expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows.every((r) => r.status === "reported")).toBe(
      true,
    );
  },
);

it.each(["read-final.v1", "read-final.v2"])(
  "preserves read/final and scoped reference contracts with explicit proposal timing: %s",
  async (decisionContract) => {
    const f = await setup();
    let calls = 0;
    const connect = f.board.adapter.connect;
    f.board.adapter.connect = async (binding) => ({
      ...(await connect(binding)),
      readQuerySchema: async () => ({ type: "object", properties: {}, additionalProperties: false }),
    });
    await f.pool.query(
      "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
      [
        f.group.id,
        {
          participantContract: "scoped.v1",
          decisionContract,
          readQueryContract: "environment.v1",
          skillReferenceContract: "listed.v1",
          goalReferenceContract: "scoped.v1",
        },
      ],
    );
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      calls++;
      const wire = JSON.parse(String(init.body)),
        packet = JSON.parse(wire.messages[1].content),
        v = new Ajv({ strict: false, validateFormats: false }).compile(wire.format),
        update = { goals: [], memories: [], predictions: [], plan: null, messages: [], wakeConditions: [] };
      expect(f.board.executions).toBe(0);
      expect(v({ decision: { kind: "read", query: {}, summary: "Read before effects" }, update })).toBe(false);
      expect(
        v({ decision: { kind: "wait", summary: "Conditional plan only" }, update, skills: { publish: [], adopt: [] } }),
      ).toBe(true);
      if (decisionContract === "read-final.v2") {
        expect(wire.messages[0].content).toContain("pre-dispatch");
        expect(wire.messages[0].content).toContain("conditional plans");
        expect(wire.messages[0].content).toContain("never selected actions as already done/pending");
        expect(wire.messages[0].content).toContain("Distinguish consent, admission, receipt and fulfillment");
      } else
        expect(packet.readInterface.meaning).toBe(
          "Read returns observations, not grants. Revision/source IDs are provenance, never mandates. Updates persist only with final wait/action.",
        );
      return Response.json({
        message: { content: JSON.stringify({ decision: { kind: "wait", summary: "No new effect claimed" } }) },
        done: true,
        done_reason: "stop",
        prompt_eval_count: 10,
        eval_count: 10,
      });
    });
    const [id] = await f.enqueue("resource"),
      claim = await f.tasks.claim("proposal-phase", f.now(), id);
    if (!claim) throw Error("CLAIM_REQUIRED");
    await f
      .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
      .host.run(claim);
    expect(calls).toBe(1);
    expect(f.board.executions).toBe(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual([{ status: "reported" }]);
  },
);

it.each(
  ["environment.v2", "environment.v4"].flatMap((contract) =>
    ["read", "continuity", "changed", "removed"].map((mode) => ({ contract, mode })),
  ),
)("retains schema progress across $mode and invalidates catalog drift with $contract", async ({ contract, mode }) => {
  const f = await setup();
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { readQueryContract: contract, responseContract: "visible.v1", decisionContract: "read-final.v2" }],
  );
  const { pactReadQuerySchema } = await import("../../src/games/pact/read-queries.js");
  const tool = {
    name: "board.peek",
    inputSchema: {
      type: "object",
      properties: { square: { enum: ["a1", "a2"] } },
      required: ["square"],
      additionalProperties: false,
    },
  };
  const connect = f.board.adapter.connect;
  let reads = 0,
    requests = 0;
  let lookups = 0;
  f.board.adapter.connect = async (binding) => {
    const session = await connect(binding);
    return {
      ...session,
      catalog: async () => {
        lookups++;
        return [
          ...(await session.catalog()),
          ...(mode === "removed" && requests >= 2
            ? []
            : [
                {
                  ...tool,
                  ...(mode === "changed" && requests >= 2
                    ? { inputSchema: { ...tool.inputSchema, properties: { square: { enum: ["b1"] } } } }
                    : {}),
                  annotations: { readOnlyHint: true },
                },
              ]),
        ];
      },
      readQuerySchema: async (options) => {
        expect(options).toEqual({
          requireKnownArguments: true,
          ...(contract === "environment.v4" ? { contractVersion: 3 } : {}),
          ...(requests >= 1 && !(requests >= 2 && ["changed", "removed"].includes(mode))
            ? { retrievedTool: tool.name }
            : {}),
        });
        return pactReadQuerySchema(
          mode === "removed" && requests >= 2 ? [] : [tool.name],
          true,
          options?.retrievedTool === tool.name ? [tool] : [],
          [],
          options?.contractVersion,
        );
      },
      observe: async (query) => {
        if (query.readSchema) throw Error("METADATA_MUST_NOT_REFRESH_GAME_FACTS");
        if (query.tool === tool.name) {
          expect(query.args).toEqual({ square: "a2" });
          reads++;
        }
        return session.observe({});
      },
    };
  };
  let originalSnapshot: unknown;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)),
      check = new Ajv({ strict: false, validateFormats: false }).compile(body.format);
    const packet = JSON.parse(body.messages[1].content),
      snapshot = {
        revision: packet.observation.revision,
        observedAt: packet.observation.observedAt,
        environmentTime: packet.observation.environmentTime,
        sourceRefs: packet.observation.sourceRefs,
      };
    if (requests === 0) originalSnapshot = snapshot;
    if (requests === 1) expect(snapshot).toEqual(originalSnapshot);
    const wrap = (query: Data) => ({ decision: { kind: "read", query, summary: "Read native facts" } });
    expect(check(wrap({ readSchema: tool.name }))).toBe(requests === 0 || (requests === 2 && mode === "changed"));
    expect(check(wrap({ tool: tool.name, args: { records: [] } }))).toBe(false);
    expect(check(wrap({ tool: tool.name, args: { square: "a2" } }))).toBe(
      requests >= 1 && !(requests === 2 && ["changed", "removed"].includes(mode)),
    );
    if (requests === 1) expect(packet.readInterface.retrievedTool.result).toBe("schema_available");
    const decision =
      requests === 0
        ? wrap({ readSchema: tool.name })
        : requests === 1
          ? mode === "continuity"
            ? wrap({ continuity: true, coordination: true })
            : wrap({ tool: tool.name, args: { square: "a2" } })
          : { decision: { kind: "wait", summary: "Facts inspected; no action" } };
    requests++;
    return Response.json({
      message: { content: JSON.stringify(decision) },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 10,
      eval_count: 10,
    });
  });
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("known-arguments", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await f
    .host(new HttpModel({ ollama: "http://provider.invalid" }, undefined), undefined, {}, f.store.architectures)
    .host.run(claim);
  expect(requests).toBe(3);
  expect(lookups).toBeGreaterThanOrEqual(1);
  expect(reads).toBe(mode === "continuity" ? 0 : 1);
  expect(f.board.executions).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='reported'")).rows[0].n).toBe(3);
});
it("refuses an ignored known-argument capability before any model admission", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (binding) => ({
    ...(await connect(binding)),
    readQuerySchema: async () => ({ type: "object", additionalProperties: true }),
  });
  await f.pool.query(
    "UPDATE cohort_engine_profiles SET architecture_config=architecture_config || $2::jsonb WHERE cohort_id=$1",
    [f.group.id, { readQueryContract: "environment.v2" }],
  );
  const [id] = await f.enqueue("resource"),
    claim = await f.tasks.claim("missing-known-arguments", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      throw Error("MUST_NOT_DISPATCH");
    },
  };
  await expect(f.host(model, undefined, {}, f.store.architectures).host.run(claim)).rejects.toThrow(
    "READ_ARGUMENT_CONTRACT_REQUIRED",
  );
  expect(calls).toBe(0);
  expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(0);
});

it("records call exhaustion without fabricating a final decision or executing an action", async () => {
  const f = await setup();
  let calls = 0;
  const model = {
    decide: async () => {
      calls++;
      return {
        decision: { decision: { kind: "read", query: {}, summary: "Read again" } },
        inputTokens: 10,
        outputTokens: 10,
      };
    },
  };
  const [id] = await f.enqueue("resource");
  const claim = await f.tasks.claim("bounded-no-progress", f.now(), id);
  if (!claim) throw Error("CLAIM_REQUIRED");
  await f.host(model, undefined, {}, f.store.architectures).host.run(claim);
  expect(calls).toBe(3);
  expect(f.board.executions).toBe(0);
  const events = (
    await f.pool.query("SELECT id,detail_cipher FROM turn_events WHERE label=$1", [
      "Specialist call limit reached without a final decision",
    ])
  ).rows;
  expect(events).toHaveLength(1);
  expect(f.store.vault.decrypt(events[0].detail_cipher, `turn-event:${events[0].id}`)).toEqual({
    reason: "NO_FINAL_DECISION_CALL_LIMIT",
    maxCallsPerTurn: 3,
  });
  expect((await f.pool.query("SELECT count(*)::int n FROM platform_commands")).rows[0].n).toBe(0);
});
