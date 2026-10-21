import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { ParticipantWork } from "../../src/app/participant-work.js";
import { transaction } from "../../src/db.js";
import { LaunchService } from "../../src/platform/launch.js";
import { enableBoardEffects } from "../fixtures/environments/specialist-board.js";
import { candidate } from "../fixtures/skills/candidate.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
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
