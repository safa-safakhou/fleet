import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { NegotiationNonceStore, readNativeNegotiationAccounting } from "../../src/app/negotiation-ledger.js";
import { migrate } from "../../src/db.js";
import { designDigest, negotiationPlan } from "../../src/negotiation-plan.js";
import type { NegotiationBinding } from "../../src/negotiation-run.js";
import { Bindings } from "../../src/platform/bindings.js";
import { TaskStore } from "../../src/platform/tasks.js";
import { selections } from "../fixtures/negotiation/evidence.js";
import { budget, fixture } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => close?.());
it("nonce claim is atomic, terminal, and unchanged by repeated migration", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const store = new NegotiationNonceStore(f.store),
    nonce = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => store.claimNonce(nonce, "a".repeat(64), "b".repeat(64))),
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  await store.finishNonce(nonce, "stopped", "c".repeat(64));
  await migrate(f.pool);
  expect(await store.claimNonce(nonce, "d".repeat(64), "e".repeat(64))).toBe(false);
  expect(await store.consumed(nonce)).toBe(true);
  await expect(store.finishNonce(nonce, "complete", "f".repeat(64))).rejects.toThrow(
    "NEGOTIATION_NONCE_ALREADY_TERMINAL",
  );
  expect(
    (
      await f.pool.query(
        "SELECT protocol_digest,grant_digest,status,result_digest FROM negotiation_protocol_batches WHERE nonce=$1",
        [nonce],
      )
    ).rows,
  ).toEqual([
    { protocol_digest: "a".repeat(64), grant_digest: "b".repeat(64), status: "stopped", result_digest: "c".repeat(64) },
  ]);
  expect((await f.pool.query("SELECT * FROM compute_ledger")).rowCount).toBe(0);
});
it("reads existing native turn/allocation rows without refund, mutation or a second spend counter", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const cell = negotiationPlan("E3", selections)[0],
    worldId = randomUUID(),
    ref = { id: "pact", version: "1", instanceId: worldId },
    bindings = new Bindings(f.store, ref),
    tasks = new TaskStore(f.store, bindings, 1);
  const { id } = await f.store.create({
    name: "Native ledger fixture",
    count: 2,
    intervalMinutes: 15,
    seed: "native-ledger",
    strategies: ["merchant"],
  });
  await f.store.configure(id, {
    model: { route: "ollama", model: "fake" },
    budget: {
      ...budget,
      callLimit: cell.limits.callsPerWorld,
      tokenLimit: cell.limits.reservedTokensPerWorld,
      deadlineAt: new Date(f.now().getTime() + cell.limits.wallDeadlineMs).toISOString(),
      concurrency: 1,
    },
  });
  const agents = (await f.pool.query("SELECT id FROM agents WHERE cohort_id=$1 ORDER BY ordinal", [id])).rows;
  const actors = [randomUUID(), randomUUID()],
    refs = [];
  for (let i = 0; i < 2; i++) {
    const account = randomUUID();
    await f.pool.query(
      "UPDATE agents SET account_id=$2,kingdom_id=$3,state='ready',credential_state='ready' WHERE id=$1",
      [agents[i].id, account, actors[i]],
    );
    refs.push(
      await bindings.bind(agents[i].id, {
        environment: ref,
        accountRef: account,
        actorRef: account,
        entityRef: actors[i],
      }),
    );
  }
  await tasks.enroll(id, cell.profile);
  await f.store.setState(id, "running", true);
  const binding: NegotiationBinding = {
    cellId: cell.id,
    worldId,
    controlWorldId: randomUUID(),
    cohortId: id,
    actorIds: actors,
    bindingIds: refs.map((b) => b.id),
    fixtureNonce: "a".repeat(64),
    evidenceRef: "retained-evidence",
    keyRef: "private-key-ref",
  };
  const world = {
    ownershipValid: true,
    privacyValid: true,
    authorityValid: true,
    duplicateEffects: 0,
    gameTimeMs: "0",
    startGameTimeMs: "0",
    nextScheduledGameTimeMs: "60000",
  };
  await tasks.upsertFromEvent(
    refs[0],
    {
      id: "periodic",
      type: "periodic",
      sourceRef: "periodic",
      observedAt: f.now().toISOString(),
      environmentTime: { clockId: "pact.game-time-ms", value: "0" },
      metadata: {},
    },
    "periodic",
  );
  const claim = await tasks.claim("native-fixture", f.now());
  if (!claim) throw Error("claim");
  const original = await f.store.reserveCall(claim.turn);
  let state = await readNativeNegotiationAccounting(f.store, binding, cell, world);
  expect(state.allocations).toEqual([
    expect.objectContaining({ id: original, status: "reserved", reservedTokens: 40000 }),
  ]);
  expect(state).toMatchObject({
    ownershipValid: true,
    inFlight: 1,
    limitsDigest: designDigest(cell.limits),
    profile: cell.profile,
  });
  await f.store.recordUsage(original, null, null);
  await tasks.finish(claim, "TRANSPORT_UNCERTAIN");
  const before = JSON.stringify((await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows);
  state = await readNativeNegotiationAccounting(f.store, binding, cell, world);
  expect(state.allocations).toEqual([
    expect.objectContaining({
      id: original,
      status: "unknown",
      reservedTokens: 40000,
      inputTokens: null,
      outputTokens: null,
    }),
  ]);
  expect(state.turns).toHaveLength(1);
  expect(state.inFlight).toBe(0);
  expect(
    (await readNativeNegotiationAccounting(f.store, { ...binding, worldId: randomUUID() }, cell, world)).ownershipValid,
  ).toBe(false);
  expect(JSON.stringify((await f.pool.query("SELECT * FROM compute_ledger ORDER BY id")).rows)).toBe(before);
});
