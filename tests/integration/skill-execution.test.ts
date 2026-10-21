import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SkillExecutionStore } from "../../src/app/skill-execution.js";
import type { ExistingSkillGoal } from "../../src/modules/skills/v1/checkpoints.js";
import { PrimitiveRegistry } from "../../src/modules/skills/v1/primitives.js";
import { RecipeRunner, SkillSelector } from "../../src/modules/skills/v1/runner.js";
import { type SkillVersion, skillContentDigest } from "../../src/modules/skills/v1/schema.js";
import { skillLibraryFixture } from "../fixtures/skills/library.js";

let s: Awaited<ReturnType<typeof skillLibraryFixture>>;
afterEach(async () => {
  await s?.f.close();
});
it("completes a known exact goal with zero model calls and accounted finite work", async () => {
  s = await skillLibraryFixture();
  await s.f.tasks.enroll(s.f.id, { id: "fixture", version: "2" });
  const limits = { reads: 4, actions: 0, messages: 0, steps: 8, wallTimeMs: 60000 };
  await s.f.pool.query("UPDATE cohort_engine_profiles SET non_model_limits=$2 WHERE cohort_id=$1", [s.f.id, limits]);
  const body = {
    ...s.body,
    representation: "recipe" as const,
    limits: { ...limits, modelCalls: 0 as const },
    compatibility: { ...s.body.compatibility, primitives: [{ id: "stock", version: "1" }] },
    procedure: {
      ...s.body.procedure,
      nodes: [{ id: "read", kind: "observe" as const, primitive: { id: "stock", version: "1" }, args: {} }],
    },
  };
  const skill: SkillVersion = {
    ref: { id: randomUUID(), version: 1, digest: skillContentDigest(body) },
    author: "resources",
    body,
    status: "guarded",
    published: false,
    createdAt: s.f.now().toISOString(),
    outcomeSupport: "unproven",
  };
  const goal: ExistingSkillGoal = {
    id: randomUUID(),
    kind: "stock",
    parameters: { resource: "iron" },
    revision: "one",
    ownerRevision: "owner-one",
    active: true,
    allowedActions: [],
  };
  let reads = 0;
  const registry = new PrimitiveRegistry([
      {
        ref: { id: "stock", version: "1" },
        kind: "observe",
        argsSchema: { type: "object", additionalProperties: false },
        work: { reads: 1, actions: 0, messages: 0, steps: 1 },
        actionKeys: [],
        run: async (_args, ctx) => ({ value: await ctx.observe({}) }),
      },
    ]),
    db = new SkillExecutionStore(s.f.store, s.scope);
  const runner = new RecipeRunner({
    scope: s.scope,
    registry,
    repository: db,
    work: db,
    load: async () => skill,
    eligible: async () => true,
    goal: async () => goal,
    observe: async () => {
      reads++;
      return { iron: "10" };
    },
    submit: async () => {
      throw Error("NO_ACTION_ALLOWED");
    },
    recover: async () => ({ status: "not_prepared" }),
    request: async () => {
      throw Error("NO_MESSAGE_ALLOWED");
    },
    now: s.f.now,
    signal: new AbortController().signal,
  });
  const input = { goalId: goal.id, skillRef: skill.ref, inputs: goal.parameters, triggerId: "owned:one" };
  expect((await runner.start(s.scope, input)).state).toBe("completed");
  expect((await runner.start(s.scope, input)).state).toBe("completed");
  expect(reads).toBe(1);
  expect((await s.f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
  expect(
    (
      await s.f.pool.query(
        "SELECT kind,units::int,actual_units::int FROM skill_work_reservations WHERE kind<>'wallTimeMs' ORDER BY kind",
      )
    ).rows,
  ).toEqual([
    { kind: "reads", units: 1, actual_units: 1 },
    { kind: "steps", units: 1, actual_units: 1 },
  ]);
  await expect(runner.start(s.scope, { ...input, triggerId: "two", inputs: { resource: "silver" } })).rejects.toThrow(
    "PARAMETERS_OUTSIDE_EXISTING_GOAL",
  );
  expect(
    new SkillSelector().choose(goal, [skill, { ...skill, ref: { ...skill.ref, id: randomUUID() } }]),
  ).toMatchObject({ kind: "reason", reason: "AMBIGUOUS_SKILL_CHOICE" });
});
it("requires persisted parent limits before any automatic execution", async () => {
  s = await skillLibraryFixture();
  const db = new SkillExecutionStore(s.f.store, s.scope);
  await expect(db.limits({ reads: 1, actions: 1, messages: 0, steps: 3, wallTimeMs: 1000 })).rejects.toThrow(
    "PARENT_WORK_LIMITS_REQUIRED",
  );
  expect((await s.f.pool.query("SELECT * FROM skill_invocations")).rowCount).toBe(0);
});
it("charges pinned child work to the same parent and preserves namespaced values", async () => {
  s = await skillLibraryFixture();
  await s.f.tasks.enroll(s.f.id, { id: "fixture", version: "2" });
  const limits = { reads: 1, actions: 0, messages: 0, steps: 2, wallTimeMs: 10000 };
  await s.f.pool.query("UPDATE cohort_engine_profiles SET non_model_limits=$2 WHERE cohort_id=$1", [s.f.id, limits]);
  const childBody = {
    ...s.body,
    representation: "recipe" as const,
    compatibility: { ...s.body.compatibility, primitives: [{ id: "stock", version: "1" }] },
    procedure: {
      ...s.body.procedure,
      nodes: [
        { id: "read", kind: "observe" as const, primitive: { id: "stock", version: "1" }, args: {}, saveAs: "stock" },
      ],
    },
  };
  const child: SkillVersion = {
    ref: { id: randomUUID(), version: 1, digest: skillContentDigest(childBody) },
    body: childBody,
    author: "resources",
    status: "guarded",
    published: false,
    createdAt: s.f.now().toISOString(),
    outcomeSupport: "unproven",
  };
  const parentBody = {
    ...s.body,
    representation: "recipe" as const,
    limits: { ...limits, modelCalls: 0 as const },
    procedure: {
      ...s.body.procedure,
      children: [child.ref],
      nodes: [{ id: "child", kind: "invoke" as const, skill: child.ref, args: { resource: { $input: "resource" } } }],
    },
  };
  const parent: SkillVersion = {
    ...child,
    body: parentBody,
    ref: { id: randomUUID(), version: 1, digest: skillContentDigest(parentBody) },
  };
  const goal: ExistingSkillGoal = {
      id: randomUUID(),
      kind: "stock",
      parameters: { resource: "iron" },
      revision: "one",
      ownerRevision: "owner",
      active: true,
      allowedActions: [],
    },
    db = new SkillExecutionStore(s.f.store, s.scope),
    registry = new PrimitiveRegistry([
      {
        ref: { id: "stock", version: "1" },
        kind: "observe",
        argsSchema: { type: "object", additionalProperties: false },
        work: { reads: 1, actions: 0, messages: 0, steps: 1 },
        actionKeys: [],
        run: async (_args, c) => ({ value: await c.observe({}) }),
      },
    ]);
  const runner = new RecipeRunner({
    scope: s.scope,
    registry,
    repository: db,
    work: db,
    load: async () => parent,
    children: async () => new Map([[child.ref.digest, child]]),
    eligible: async () => true,
    goal: async () => goal,
    observe: async () => ({ iron: "10" }),
    submit: async () => {
      throw Error("NO_ACTION");
    },
    recover: async () => ({ status: "not_prepared" }),
    request: async () => {
      throw Error("NO_MESSAGE");
    },
    now: s.f.now,
    signal: new AbortController().signal,
  });
  const result = await runner.start(s.scope, {
    goalId: goal.id,
    skillRef: parent.ref,
    inputs: goal.parameters,
    triggerId: "parent",
  });
  expect(result).toMatchObject({ state: "completed", values: { child: { stock: { iron: "10" } } } });
  expect(
    (
      await s.f.pool.query(
        "SELECT kind,sum(units)::int units FROM skill_work_reservations WHERE kind<>'wallTimeMs' GROUP BY kind ORDER BY kind",
      )
    ).rows,
  ).toEqual([
    { kind: "reads", units: 1 },
    { kind: "steps", units: 2 },
  ]);
});
