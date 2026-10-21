import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { migrate } from "../../src/db.js";
import { launchFixture } from "../fixtures/architecture-launch.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
async function setup() {
  f = await launchFixture(false);
  await f.store.consent(f.id, true);
  const binding = await f.tasks.bindings.forAgent(f.agent);
  if (!binding) throw Error("BINDING_REQUIRED");
  const scope = {
    instanceId: `${binding.id}:autonomous-specialists@1`,
    bindingId: binding.id,
    specialistId: "resources",
  };
  const repository = new SpecialistRepository(f.store, { instanceId: scope.instanceId, bindingId: binding.id });
  await repository.initialize([
    {
      id: "resources",
      revision: 1,
      responsibility: "Maintain reserves",
      priority: 1,
      allowedActions: ["board.move.v1"],
      maxActiveGoals: 8,
    },
    {
      id: "diplomacy",
      revision: 1,
      responsibility: "Negotiate permitted terms",
      priority: 1,
      allowedActions: ["board.move.v1"],
      maxActiveGoals: 8,
    },
  ]);
  const evidence = randomUUID();
  await f.pool.query("INSERT INTO architecture_scoped_evidence VALUES($1,$2,$3,$4,$5,$6)", [
    evidence,
    scope.instanceId,
    binding.id,
    "state",
    f.store.vault.encrypt(
      { id: evidence, kind: "state", detail: { stock: "10" }, sourceRefs: ["board:1"] },
      `architecture-evidence:${scope.instanceId}:${binding.id}:${evidence}`,
    ),
    f.now(),
  ]);
  const goal = {
    id: randomUUID(),
    parentId: null,
    objective: "Keep stock available",
    rationale: "Current reserves matter",
    status: "active",
    evidenceIds: [evidence],
    assessment: "Observe retained stock",
    wake: "Next stock change",
  };
  const envelope = {
    goals: [goal],
    memories: [],
    predictions: [],
    plan: null,
    deliveryIds: [],
    messages: [],
    wakeConditions: [],
  };
  return { repository, scope, evidence, goal, envelope };
}
it("persists separate goals across restart and retains abandoned goal history", async () => {
  const { repository, scope, envelope, goal } = await setup();
  await repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope });
  const other = { ...scope, specialistId: "diplomacy" };
  await repository.accept(other, {
    expectedVersion: 0,
    operationId: randomUUID(),
    envelope: { ...envelope, goals: [{ ...goal, objective: "Find a useful partner" }] },
  });
  const restart = new SpecialistRepository(f.store, scope);
  expect((await restart.load(scope)).goals[0].objective).toBe("Keep stock available");
  expect((await restart.load(other)).goals[0].objective).toBe("Find a useful partner");
  await restart.accept(scope, {
    expectedVersion: 1,
    operationId: randomUUID(),
    envelope: { ...envelope, goals: [{ ...goal, status: "abandoned" }] },
  });
  expect((await restart.load(scope)).goals[0].status).toBe("abandoned");
  await expect(
    restart.accept(scope, {
      expectedVersion: 2,
      operationId: randomUUID(),
      envelope: { ...envelope, goals: [{ ...goal, status: "active" }] },
    }),
  ).rejects.toThrow("TERMINAL_GOAL");
});
it("rejects stale state, foreign scope and charter changes atomically", async () => {
  const { repository, scope, envelope } = await setup();
  const operationId = randomUUID();
  const input = { expectedVersion: 0, operationId, envelope };
  expect(await repository.accept(scope, input)).toEqual(await repository.accept(scope, input));
  await expect(repository.accept(scope, { ...input, operationId: randomUUID() })).rejects.toThrow(
    "STALE_STATE_VERSION",
  );
  await expect(repository.load({ ...scope, bindingId: randomUUID() })).rejects.toThrow("SPECIALIST_SCOPE_MISMATCH");
  await expect(
    repository.accept(scope, {
      expectedVersion: 1,
      operationId: randomUUID(),
      envelope: { ...envelope, charter: { priority: 100 } },
    }),
  ).rejects.toThrow();
  expect((await repository.load(scope)).charter.priority).toBe(1);
  await expect(
    repository.initialize([
      {
        id: "resources",
        revision: 1,
        responsibility: "Changed charter",
        priority: 100,
        allowedActions: [],
        maxActiveGoals: 8,
      },
      {
        id: "diplomacy",
        revision: 1,
        responsibility: "Negotiate permitted terms",
        priority: 1,
        allowedActions: ["board.move.v1"],
        maxActiveGoals: 8,
      },
    ]),
  ).rejects.toThrow("CHARTER_IMMUTABLE");
  await expect(
    repository.initialize([
      { id: "new-role", revision: 1, responsibility: "Spawn", priority: 1, allowedActions: [], maxActiveGoals: 8 },
    ]),
  ).rejects.toThrow("SPECIALIST_ROSTER_IMMUTABLE");
  await expect(
    repository.accept(scope, { expectedVersion: 1, operationId, envelope: { ...envelope, plan: "changed" } }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect((await repository.load(scope)).version).toBe(1);
});
it("rejects unsupported envelope effects and bounds active goals", async () => {
  const { repository, scope, envelope, goal } = await setup();
  for (const patch of [
    { messages: [{ to: "diplomacy", text: "hello" }] },
    { intent: { commandId: randomUUID() } },
    { deliveryIds: [randomUUID()] },
    { goals: Array.from({ length: 9 }, () => ({ ...goal, id: randomUUID() })) },
    { goals: [{ ...goal, status: "completed" }] },
  ]) {
    await expect(
      repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope: { ...envelope, ...patch } }),
    ).rejects.toThrow();
  }
  expect((await repository.load(scope)).version).toBe(0);
});
it("withholds expired or deleted support and physically clears private state on source deletion or consent withdrawal", async () => {
  const { repository, scope, envelope, evidence } = await setup();
  await repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope });
  f.advance(31 * 86400000);
  expect((await repository.load(scope)).coverage.complete).toBe(false);
  expect((await repository.load(scope)).goals).toEqual([]);
  await f.pool.query("DELETE FROM architecture_scoped_evidence WHERE id=$1", [evidence]);
  expect(
    (await f.pool.query("SELECT state_cipher FROM specialist_states WHERE specialist_id=$1", [scope.specialistId]))
      .rows[0].state_cipher,
  ).toBeNull();
  await f.store.consent(f.id, false);
  await expect(repository.load(scope)).rejects.toThrow("CONSENT_REQUIRED");
});
it("preserves existing continuity and specialist data on repeated migration", async () => {
  const { repository, scope, envelope } = await setup();
  await repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope });
  await f.pool.query(
    "INSERT INTO continuity_states(binding_id,cohort_id,namespace,version,updated_at,detail_cipher) VALUES($1,$2,$3,1,$4,$5)",
    [scope.bindingId, f.id, "reactive-cognition@1", f.now(), "preserved-opaque-cipher"],
  );
  const before = (await f.pool.query("SELECT * FROM continuity_states ORDER BY binding_id,namespace")).rows;
  await migrate(f.pool);
  await migrate(f.pool);
  expect((await f.pool.query("SELECT * FROM continuity_states ORDER BY binding_id,namespace")).rows).toEqual(before);
  expect((await repository.load(scope)).version).toBe(1);
});
