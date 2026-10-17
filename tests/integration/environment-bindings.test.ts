import { afterEach, expect, it } from "vitest";
import { migrate } from "../../src/db.js";
import { createPactEnvironment, PactBindings } from "../../src/environments/pact.js";
import { Bindings } from "../../src/platform/bindings.js";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { boardEnvironment, boardRef } from "../fixtures/environments/board.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  return f;
}
async function agent(f: Awaited<ReturnType<typeof setup>>) {
  const { id } = await f.store.create({
    name: "Board players",
    count: 1,
    intervalMinutes: 15,
    seed: "board",
    strategies: ["guardian"],
  });
  return (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1", [id])).rows[0].id as string;
}
it("binds opaque actor IDs", async () => {
  const f = await setup(),
    bindings = new Bindings(f.store, boardRef),
    id = await agent(f);
  const b = await bindings.bind(id, {
    environment: boardRef,
    accountRef: "player:red",
    actorRef: "seat:red",
    entityRef: "board:room-east",
  });
  expect(b.actorRef).toBe("seat:red");
  expect(b.entityRef).toBe("board:room-east");
  expect(await bindings.forAgent(id)).toEqual(b);
  expect((await f.store.agent(id)).account_id).toBeNull();
  expect((await f.store.agent(id)).kingdom_id).toBeNull();
  const board = boardEnvironment(),
    session = await new EnvironmentRegistry([board.adapter], boardRef).connect(b);
  const intent = { commandId: "opaque:command", bindingId: b.id, schemaId: "board.move.v1", payload: { to: "a4" } };
  await session.execute(intent);
  expect(await session.resolve(intent.commandId)).toMatchObject({ status: "confirmed" });
});
it("rejects duplicate controlling binding and preserves terminal uniqueness", async () => {
  const f = await setup(),
    bindings = new Bindings(f.store, boardRef),
    a = await agent(f),
    b = await agent(f);
  const input = { environment: boardRef, accountRef: "player:red", actorRef: "seat:red", entityRef: "board:room-east" };
  const binding = await bindings.bind(a, input);
  expect(await bindings.bind(a, input)).toEqual(binding);
  await f.pool.query("UPDATE agents SET state='stopped' WHERE id=$1", [a]);
  await expect(bindings.bind(b, input)).rejects.toThrow("CONTROLLING_BINDING_EXISTS");
  await expect(bindings.bind(a, { ...input, entityRef: "other-board" })).rejects.toThrow("BINDING_IMMUTABLE");
  await expect(bindings.bind(b, { ...input, environment: { ...boardRef, instanceId: "foreign" } })).rejects.toThrow(
    "ENVIRONMENT_NOT_SELECTED",
  );
});
it("preserves legacy vault identity and pending receipt", async () => {
  const f = await setup(),
    cohort = await ready(f.store, 1),
    claim = await f.store.claim("legacy-binding");
  if (!claim) throw Error("NO_CLAIM");
  const cipher = f.store.vault.encrypt({ token: "synthetic-only" }, `agent:${claim.agentId}`);
  await f.pool.query("UPDATE agents SET secret_cipher=$2 WHERE id=$1", [claim.agentId, cipher]);
  const command = "00000000-0000-4000-8000-000000000001";
  await f.store.pending(claim, command, { kind: "game.building.queue" });
  const allocation = await f.store.reserveCall(claim);
  await f.store.recordUsage(allocation, null, null);
  const ledgerBefore = (await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [allocation])).rows;
  const before = (
    await f.pool.query(
      "SELECT to_jsonb(a) agent,to_jsonb(t) turn FROM agents a JOIN turns t ON t.agent_id=a.id WHERE t.id=$1",
      [claim.id],
    )
  ).rows;
  const ref = { id: "pact", version: "1", instanceId: "fixture:legacy" },
    bindings = new Bindings(f.store, ref),
    legacy = new PactBindings(f.store, bindings);
  await migrate(f.pool);
  const binding = await legacy.attach(claim.agentId);
  expect((await f.pool.query("SELECT * FROM compute_ledger WHERE id=$1", [allocation])).rows).toEqual(ledgerBefore);
  expect(binding.accountRef).toBe(claim.agent.account_id);
  expect(binding.entityRef).toBe(claim.agent.kingdom_id);
  expect(await legacy.agentFor(binding)).toBe(claim.agentId);
  expect(f.store.vault.decrypt(cipher, `agent:${claim.agentId}`)).toEqual({ token: "synthetic-only" });
  expect(
    (
      await f.pool.query(
        "SELECT to_jsonb(a) agent,to_jsonb(t) turn FROM agents a JOIN turns t ON t.agent_id=a.id WHERE t.id=$1",
        [claim.id],
      )
    ).rows,
  ).toEqual(before);
  const game = new FakeGame(claim),
    adapter = createPactEnvironment({ store: f.store, bindings: legacy, game: async () => game, now: f.now });
  const registry = new EnvironmentRegistry([adapter], ref),
    session = await registry.connect(binding);
  expect(await session.resolve(command)).toMatchObject({ commandId: command, status: "confirmed" });
  game.receiptValue = { commandId: command, code: "NEW_UNRECOGNIZED_RECEIPT" };
  expect(await session.resolve(command)).toMatchObject({ status: "unknown" });
  game.receiptValue = { commandId: command, code: "SLOT_BUSY" };
  expect(await session.resolve(command)).toMatchObject({ status: "rejected" });
  expect(game.submits).toHaveLength(0);
  await expect(legacy.agentFor({ ...binding, actorRef: "forged" })).rejects.toThrow("BINDING_MISMATCH");
  expect(Number((await f.store.cohort(cohort)).generation)).toBe(claim.generation);
});
