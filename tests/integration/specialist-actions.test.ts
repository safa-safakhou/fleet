import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { ParticipantActions } from "../../src/app/action-services.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { transaction } from "../../src/db.js";
import { ActionClaimRepository } from "../../src/modules/action-admission/v1/repository.js";
import { actionIntentDigest } from "../../src/platform/action-effects.js";
import { enableBoardEffects } from "../fixtures/environments/specialist-board.js";
import { FakeModel } from "../helpers.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
  end = undefined;
});
async function setup() {
  const f = await platformFixture();
  end = () => f.pool.end();
  enableBoardEffects(f.board, f.now);
  await f.store.consent(f.group.id, true);
  await f.enqueue();
  const claim = await f.claim(),
    binding = f.group.bindings[0],
    host = f.host(new FakeModel([]));
  const scope = { instanceId: `${binding.id}:fixture-loop@1`, bindingId: binding.id, specialistId: "resources" };
  const state = new SpecialistRepository(f.store, scope, (db) => f.tasks.check(claim, db));
  await state.initialize([
    {
      id: "resources",
      revision: 1,
      responsibility: "Use tokens",
      priority: 1,
      allowedActions: ["board.move.v1"],
      maxActiveGoals: 8,
    },
  ]);
  const intent = { commandId: randomUUID(), bindingId: binding.id, schemaId: "board.move.v1", payload: { to: "a2" } };
  const quote = {
    schemaVersion: "fleet.action-effects.v1" as const,
    revision: "revision:1",
    intentDigest: actionIntentDigest(intent),
    actionKey: "board.move.v1",
    claims: [{ kind: "resource" as const, schemaId: "tokens.v1", key: "stock", units: "6" }],
    capacities: [{ schemaId: "tokens.v1", key: "stock", remainingUnits: "10" }],
    sourceRefs: ["board:1"],
    validUntil: { clockId: "utc", value: new Date(f.now().getTime() + 60000).toISOString() },
    coverage: { complete: true, omitted: [] },
    supported: true,
  };
  const envelope = {
    goals: [],
    memories: [],
    predictions: [],
    plan: null,
    deliveryIds: [],
    messages: [],
    wakeConditions: [],
  };
  const actions = new ParticipantActions({
    store: f.store,
    tasks: f.tasks,
    commands: host.commands,
    claim,
    binding,
    specialistId: scope.specialistId,
    quote: async () => quote,
    clock: { clockId: "utc", value: f.now().toISOString() },
  });
  return { ...f, claim, binding, scope, state, intent, quote, envelope, actions, host };
}
it("atomically accepts state and immutable intent before one canonical dispatch", async () => {
  const f = await setup();
  const input = { expectedVersion: 0, envelope: f.envelope, intent: f.intent };
  expect((await f.actions.acceptAndDispatch(input)).outcome?.status).toBe("confirmed");
  expect((await f.actions.acceptAndDispatch(input)).outcome?.status).toBe("confirmed");
  expect(f.board.executions).toBe(1);
  expect((await f.state.load(f.scope)).version).toBe(1);
  expect((await f.pool.query("SELECT * FROM specialist_intents")).rowCount).toBe(1);
  expect((await f.pool.query("SELECT * FROM specialist_action_results")).rowCount).toBe(1);
});
it("rolls back claims, intent and state together on a stale state version", async () => {
  const f = await setup();
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 1, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow("STALE_STATE_VERSION");
  expect((await f.pool.query("SELECT * FROM specialist_claims")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
  expect(f.board.executions).toBe(0);
});
it("serializes individually affordable local claims and retains unknown protection", async () => {
  const f = await setup(),
    claims = new ActionClaimRepository(f.store);
  await transaction(f.pool, (db) => claims.reserveWithin(db, f.scope, f.intent, f.quote));
  const second = { ...f.intent, commandId: randomUUID() };
  await expect(
    transaction(f.pool, (db) =>
      claims.reserveWithin(db, { ...f.scope, specialistId: "diplomacy" }, second, {
        ...f.quote,
        intentDigest: actionIntentDigest(second),
      }),
    ),
  ).rejects.toThrow("RESOURCE_CLAIM_CONFLICT");
  f.advance(2 * 60000);
  expect((await f.pool.query("SELECT status FROM specialist_claims")).rows[0].status).toBe("held");
});
it("retains a possibly dispatched command, reconciles its original receipt and emits one result", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  let answer = false;
  f.board.adapter.connect = async (b) => {
    const s = await connect(b);
    return {
      ...s,
      execute: async (i) => {
        const result = await s.execute(i);
        return answer ? result : { ...result, status: "unknown" as const, code: "TRANSPORT_UNCERTAIN" };
      },
    };
  };
  const input = { expectedVersion: 0, envelope: f.envelope, intent: f.intent };
  expect((await f.actions.acceptAndDispatch(input)).outcome?.status).toBe("unknown");
  expect((await f.pool.query("SELECT status FROM specialist_claims")).rows[0].status).toBe("held");
  answer = true;
  expect((await f.actions.reconcile(f.intent.commandId)).status).toBe("confirmed");
  expect((await f.actions.reconcile(f.intent.commandId)).status).toBe("confirmed");
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT * FROM specialist_action_results")).rowCount).toBe(1);
});
it("rejects an expired quote, missing coverage or stale native fence before dispatch", async () => {
  const f = await setup();
  f.advance(60001);
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow("ACTION_QUOTE_EXPIRED");
  expect(f.board.executions).toBe(0);
  await f.tasks.cancel(f.claim);
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow();
});
it("expires only a proven prepared command and keeps its original ID and zero effects", async () => {
  const f = await setup();
  f.host.commands.dispatchPrepared = async () => {
    throw Error("fixture crash before dispatch");
  };
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow("fixture crash");
  expect(
    (await f.pool.query("SELECT state FROM platform_commands WHERE command_id=$1", [f.intent.commandId])).rows[0].state,
  ).toBe("prepared");
  f.advance(60001);
  expect((await f.actions.expirePrepared(f.intent.commandId)).status).toBe("rejected");
  expect((await f.pool.query("SELECT status FROM specialist_claims")).rows[0].status).toBe("released");
  expect(f.board.executions).toBe(0);
});
it("rolls back a failure after reservation and native preparation before state acceptance", async () => {
  const f = await setup();
  await f.pool.query(
    "CREATE OR REPLACE FUNCTION fixture_fail_specialist_intent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic intent failure'; END $$; CREATE TRIGGER fixture_intent_failure BEFORE INSERT ON specialist_intents FOR EACH ROW EXECUTE FUNCTION fixture_fail_specialist_intent()",
  );
  try {
    await expect(
      f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
    ).rejects.toThrow("synthetic intent failure");
  } finally {
    await f.pool.query(
      "DROP TRIGGER fixture_intent_failure ON specialist_intents; DROP FUNCTION fixture_fail_specialist_intent()",
    );
  }
  expect((await f.pool.query("SELECT * FROM specialist_claims")).rowCount).toBe(0);
  expect((await f.pool.query("SELECT * FROM platform_commands")).rowCount).toBe(0);
  expect((await f.state.load(f.scope)).version).toBe(0);
  expect(
    (await f.pool.query("SELECT pending_command FROM turns WHERE id=$1", [f.claim.turn.id])).rows[0].pending_command,
  ).toBeNull();
});
it("reconstructs an undelivered terminal result without repeating the world action", async () => {
  const f = await setup();
  await f.pool.query(
    "CREATE OR REPLACE FUNCTION fixture_fail_specialist_result() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic result failure'; END $$; CREATE TRIGGER fixture_result_failure BEFORE INSERT ON specialist_action_results FOR EACH ROW EXECUTE FUNCTION fixture_fail_specialist_result()",
  );
  try {
    await expect(
      f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
    ).rejects.toThrow("synthetic result failure");
  } finally {
    await f.pool.query(
      "DROP TRIGGER fixture_result_failure ON specialist_action_results; DROP FUNCTION fixture_fail_specialist_result()",
    );
  }
  expect(f.board.executions).toBe(1);
  expect((await f.actions.reconcile(f.intent.commandId)).status).toBe("confirmed");
  expect((await f.actions.reconcile(f.intent.commandId)).status).toBe("confirmed");
  expect(f.board.executions).toBe(1);
  expect((await f.pool.query("SELECT * FROM specialist_action_results")).rowCount).toBe(1);
});
it("rejects incomplete effects and changed command identity before any reservation", async () => {
  const f = await setup();
  f.quote.coverage.complete = false;
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow("INCOMPLETE_ACTION_EFFECTS");
  f.quote.coverage.complete = true;
  f.quote.intentDigest = "0".repeat(64);
  await expect(
    f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent }),
  ).rejects.toThrow("EFFECT_INTENT_MISMATCH");
  expect((await f.pool.query("SELECT * FROM specialist_claims")).rowCount).toBe(0);
  expect(f.board.executions).toBe(0);
});
it("does not release a dispatched unknown just because its reservation expired", async () => {
  const f = await setup(),
    connect = f.board.adapter.connect;
  f.board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    execute: async (i) => ({ commandId: i.commandId, status: "unknown", code: "TRANSPORT_UNCERTAIN", sourceRefs: [] }),
    resolve: async (commandId) => ({ commandId, status: "unknown", code: "UNRESOLVED", sourceRefs: [] }),
  });
  await f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent });
  f.advance(60001);
  expect((await f.actions.expirePrepared(f.intent.commandId)).status).toBe("unknown");
  expect((await f.pool.query("SELECT status FROM specialist_claims")).rows[0].status).toBe("held");
  expect((await f.pool.query("SELECT * FROM specialist_action_results")).rowCount).toBe(0);
});
it("reconciles after restart without fabricating an active claim or permitting fresh dispatch", async () => {
  const f = await setup();
  await f.actions.acceptAndDispatch({ expectedVersion: 0, envelope: f.envelope, intent: f.intent });
  const recovery = new ParticipantActions({
    store: f.store,
    tasks: f.tasks,
    commands: f.host.commands,
    binding: f.binding,
    scope: f.scope,
  });
  expect((await recovery.reconcile(f.intent.commandId)).status).toBe("confirmed");
  await expect(
    recovery.acceptAndDispatch({
      expectedVersion: 1,
      envelope: f.envelope,
      intent: { ...f.intent, commandId: randomUUID() },
    }),
  ).rejects.toThrow("PARTICIPANT_OPERATION_REQUIRED");
  expect(f.board.executions).toBe(1);
});
