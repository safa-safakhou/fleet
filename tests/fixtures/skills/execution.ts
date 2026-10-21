import { randomUUID } from "node:crypto";
import { ParticipantActions } from "../../../src/app/action-services.js";
import { SpecialistRepository } from "../../../src/app/participant-services.js";
import { SkillExecutionStore } from "../../../src/app/skill-execution.js";
import { ScopedSkillRepository } from "../../../src/app/skill-services.js";
import { type Data, FleetError } from "../../../src/domain.js";
import type { ExistingSkillGoal } from "../../../src/modules/skills/v1/checkpoints.js";
import type { WorkLimits } from "../../../src/modules/skills/v1/costs.js";
import { PrimitiveRegistry } from "../../../src/modules/skills/v1/primitives.js";
import { QualificationPolicy, runTrustedCases, TrustedCaseSet } from "../../../src/modules/skills/v1/qualification.js";
import { type RecipePorts, RecipeRunner } from "../../../src/modules/skills/v1/runner.js";
import { FakeModel } from "../../helpers.js";
import { platformFixture } from "../../platform-helpers.js";
import { enableBoardEffects } from "../environments/specialist-board.js";
import { candidate } from "./candidate.js";
export async function executionFixture(
  limits: WorkLimits = { reads: 4, actions: 1, messages: 0, steps: 12, wallTimeMs: 60000 },
) {
  const f = await platformFixture(1);
  enableBoardEffects(f.board, f.now);
  await f.store.consent(f.group.id, true);
  await f.pool.query("UPDATE cohort_engine_profiles SET non_model_limits=$2 WHERE cohort_id=$1", [f.group.id, limits]);
  await f.enqueue();
  const claim = await f.claim(),
    binding = f.group.bindings[0],
    native = f.host(new FakeModel([])),
    scope = { instanceId: `${binding.id}:fixture-loop@1`, bindingId: binding.id, specialistId: "resources" };
  const state = new SpecialistRepository(f.store, scope, (db) => f.tasks.check(claim, db));
  await state.initialize([
    {
      id: "resources",
      revision: 1,
      responsibility: "Own exact board moves",
      priority: 0,
      allowedActions: ["board.move.v1"],
      maxActiveGoals: 8,
    },
  ]);
  const session = await f.environments.connect(binding),
    observation = await session.observe({}),
    sourceId = randomUUID(),
    original = {
      id: sourceId,
      kind: "specialist-observation.v1",
      detail: { kind: "observation", detail: observation.payload },
      sourceRefs: observation.sourceRefs,
    };
  await f.pool.query("INSERT INTO architecture_scoped_evidence VALUES($1,$2,$3,$4,$5,$6)", [
    sourceId,
    scope.instanceId,
    binding.id,
    original.kind,
    f.store.vault.encrypt(original, `architecture-evidence:${scope.instanceId}:${binding.id}:${sourceId}`),
    f.now(),
  ]);
  const body = candidate(sourceId);
  body.representation = "recipe";
  body.purpose.goalKinds = ["move"];
  body.applicability.goalKind = "move";
  body.inputs = {
    type: "object",
    properties: { from: { type: "string", maxLength: 2 }, to: { type: "string", maxLength: 2 } },
    required: ["from", "to"],
    additionalProperties: false,
  };
  body.compatibility.actionKeys = ["board.move.v1"];
  body.effects.actionKeys = ["board.move.v1"];
  body.limits = { ...limits, reads: 3, actions: 1, steps: 6, modelCalls: 0 };
  body.procedure.template = "fixture.move.v1";
  const refs = [
    { id: "position", version: "1" },
    { id: "from", version: "1" },
    { id: "move", version: "1" },
  ];
  body.compatibility.primitives = refs;
  body.procedure.nodes = [
    { id: "read", kind: "observe", primitive: refs[0], args: {}, saveAs: "position" },
    {
      id: "check",
      kind: "check",
      primitive: refs[1],
      args: { current: { $value: "position.square" }, expected: { $input: "from" } },
    },
    { id: "move", kind: "submit", primitive: refs[2], args: { to: { $input: "to" } }, saveAs: "receipt" },
  ];
  const registry = new PrimitiveRegistry([
    {
      ref: refs[0],
      kind: "observe",
      argsSchema: { type: "object", additionalProperties: false },
      work: { reads: 1, actions: 0, messages: 0, steps: 1 },
      actionKeys: [],
      run: async (_a, c) => ({ value: await c.observe({}) }),
    },
    {
      ref: refs[1],
      kind: "check",
      argsSchema: {
        type: "object",
        properties: { current: { type: "string" }, expected: { type: "string" } },
        required: ["current", "expected"],
        additionalProperties: false,
      },
      work: { reads: 0, actions: 0, messages: 0, steps: 1 },
      actionKeys: [],
      run: async (a) => ({ value: { satisfied: a.current === a.expected } }),
    },
    {
      ref: refs[2],
      kind: "submit",
      argsSchema: {
        type: "object",
        properties: { to: { type: "string" }, commandId: { type: "string" } },
        required: ["to", "commandId"],
        additionalProperties: false,
      },
      work: { reads: 1, actions: 1, messages: 0, steps: 1 },
      actionKeys: ["board.move.v1"],
      run: async (a, c) => {
        const outcome = await c.submit({ to: a.to }, String(a.commandId));
        return { value: outcome, outcome };
      },
    },
  ]);
  const library = new ScopedSkillRepository(f.store, scope, (db) => f.tasks.check(claim, db)),
    ref = await library.propose(scope, body),
    [unqualified] = await library.loadSelected(scope, [ref]);
  const policy = new QualificationPolicy([
    { id: "fixture.move.v1", matches: (s) => s.body.procedure.template === "fixture.move.v1" },
  ]);
  const cases = new TrustedCaseSet(
    "fixture.move.v1",
    policy.requiredCases.map((id) => ({
      id,
      run: async () => ({ case: id, synthetic: true }),
      accept: (v: unknown) => JSON.stringify(v) === JSON.stringify({ case: id, synthetic: true }),
    })),
    "fixture.native-protocol.v1",
  );
  policy.registerCases(cases);
  await library.recordQualification(
    scope,
    ref,
    registry,
    policy,
    await runTrustedCases(unqualified, registry, policy, cases, body.evidence.sourceIds),
  );
  const db = new SkillExecutionStore(f.store, scope, (c) => f.tasks.check(claim, c)),
    goal: ExistingSkillGoal = {
      id: randomUUID(),
      kind: "move",
      parameters: { from: "a1", to: "a2" },
      revision: "goal:1",
      ownerRevision: "owner:1",
      active: true,
      allowedActions: ["board.move.v1"],
    };
  let afterQuote: (() => void) | undefined;
  const ports: RecipePorts = {
    scope,
    registry,
    repository: db,
    work: db,
    load: async (r) => (await library.loadSelected(scope, [r]))[0],
    eligible: (s) => library.executionEligible(scope, s.ref, registry, policy),
    goal: async () => goal,
    observe: async () => (await session.observe({})).payload,
    submit: async (payload, commandId, validate) => {
      const intent = { commandId, bindingId: binding.id, schemaId: "board.move.v1", payload },
        envelope = {
          goals: [],
          memories: [],
          predictions: [],
          plan: null,
          deliveryIds: [],
          messages: [],
          wakeConditions: [],
        };
      const result = await new ParticipantActions({
        store: f.store,
        tasks: f.tasks,
        commands: native.commands,
        claim,
        binding,
        specialistId: scope.specialistId,
        quote: async (i) => {
          if (!session.effects) throw Error("EFFECTS_REQUIRED");
          const q = await session.effects(i);
          afterQuote?.();
          return q;
        },
        clock: observation.environmentTime,
        validateIntent: async () => validate(),
      }).acceptAndDispatch({ expectedVersion: (await state.load(scope)).version, envelope, intent });
      return result.outcome as unknown as Data;
    },
    recover: async (commandId) => {
      const row = (await f.pool.query("SELECT * FROM specialist_intents WHERE command_id=$1", [commandId])).rows[0];
      if (!row) return { status: "not_prepared" };
      const outcome = await new ParticipantActions({
        store: f.store,
        tasks: f.tasks,
        commands: native.commands,
        binding,
        scope,
      }).reconcile(commandId);
      return { status: outcome.status, outcome: outcome as unknown as Data };
    },
    request: async () => {
      throw new FleetError("MESSAGE_NOT_SUPPORTED", true);
    },
    now: f.now,
    signal: new AbortController().signal,
  };
  return {
    ...f,
    scope,
    goal,
    ref,
    body,
    registry,
    library,
    db,
    ports,
    runner: () => new RecipeRunner(ports),
    setAfterQuote: (fn: () => void) => {
      afterQuote = fn;
    },
    input: () => ({ goalId: goal.id, skillRef: ref, inputs: goal.parameters, triggerId: "owned-trigger" }),
    close: async () => {
      await session.close();
      await f.pool.end();
    },
  };
}
