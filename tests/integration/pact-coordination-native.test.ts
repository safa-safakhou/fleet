import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { DecisionSupportReader } from "../../../pact/packages/application/src/decision-support.js";
import { actionEffectsFixture } from "../../../pact/tests/fixtures/action-effects.js";
import type { Data, GamePort } from "../../src/domain.js";
import { checkProposals } from "../../src/engines/specialists/proposals.js";
import { PactCoordination } from "../../src/games/pact/coordination.js";
import { RemoteRejection } from "../../src/http.js";
import type { BindingRef, Observation, Proposal } from "../../src/platform/contracts.js";

let f: Awaited<ReturnType<typeof actionEffectsFixture>>;
beforeAll(async () => {
  f = await actionEffectsFixture();
});
afterAll(async () => {
  await f?.close();
});
async function setup() {
  const owner = await f.owner(),
    binding: BindingRef = {
      id: randomUUID(),
      accountRef: owner.accountId,
      actorRef: owner.accountId,
      entityRef: owner.kingdomId,
      environment: { id: "pact", version: "1", instanceId: "owned-fixture" },
    };
  const game = {
    open: async () => {},
    read: async () => new DecisionSupportReader(f.views).read(owner.accountId),
    effects: async (command: Data) => f.effects.quote(owner.principal, command),
    submitGuarded: async (command: Data, guard: Data) => {
      try {
        return await f.dispatcher.dispatchGuarded(owner.principal, { command, guard });
      } catch (error) {
        throw new RemoteRejection(String((error as { code: string }).code), 400);
      }
    },
  } as unknown as GamePort;
  const policy = new PactCoordination(binding, game, () => new Date());
  const base: Observation = {
    schemaId: "pact.observation.v1",
    revision: "unquoted",
    observedAt: new Date().toISOString(),
    environmentTime: { clockId: "pact.game-time-ms", value: "0" },
    sourceRefs: [],
    payload: { world: { profile: { kingdomId: owner.kingdomId } } },
    coverage: {},
  };
  const view = await policy.observe(base),
    focus = view.coordination!.focuses.find((x) => x.id === "game.building.queue")!;
  const option = (focus.observation.options as Data[])[0];
  const proposal: Proposal = {
    taskId: "task",
    evidenceFrameRef: view.coordination!.evidenceFrameRef,
    intent: {
      commandId: randomUUID(),
      bindingId: binding.id,
      schemaId: "pact.action.v1",
      expectedVersion: view.revision,
      payload: option.payload as Data,
    },
    evidenceRefs: focus.sourceRefs,
    claims: option.claims as Proposal["claims"],
    conflicts: [],
    expectedOutcome: {},
  };
  return { owner, policy, view, proposal, binding, game, base };
}
it("does not advertise a native supply signature whose bond exceeds stock or authority", async () => {
  const x = await setup(),
    peer = await f.owner();
  await f.pool.query(
    "INSERT INTO social_contacts(product_scope,kingdom_a,kingdom_b,accepted_game_time_ms) VALUES('pact',$1,$2,0)",
    [...[x.owner.kingdomId, peer.kingdomId].sort()],
  );
  const offer = f.command(peer.principal, {
    kind: "game.supply.offer",
    counterpartyKingdomId: x.owner.kingdomId,
    terms: {
      aToB: { resource: "iron", wholePerHour: 1 },
      bToA: { resource: "silver", wholePerHour: 1 },
      aBond: null,
      bBond: { resource: "silver", wholeAmount: 1 },
      durationHours: 1,
      noticeHours: 0,
    },
  });
  await f.dispatcher.dispatchGuarded(peer.principal, await f.guarded(peer.principal, offer));
  const first = f.command(peer.principal, { kind: "game.supply.sign", offerId: offer.commandId, version: 1 });
  await f.dispatcher.dispatchGuarded(peer.principal, await f.guarded(peer.principal, first));
  await f.pool.query(
    "UPDATE resource_balances SET ordinary_units=0,allowance_units=0 WHERE kingdom_id=$1 AND resource='silver'",
    [x.owner.kingdomId],
  );
  const quote = await f.effects.quote(
    x.owner.principal,
    f.command(x.owner.principal, { kind: "game.supply.sign", offerId: offer.commandId, version: 1 }),
  );
  expect(quote.claims).toContainEqual(expect.objectContaining({ kind: "resource", units: "600" }));
  x.base.payload.guide = { openSupplyOffers: [{ id: offer.commandId, version: 1 }] };
  const view = await x.policy.observe(x.base);
  expect(view.coordination!.focuses.map((f) => f.id)).not.toContain("game.supply.sign");
  expect(view.coordination!.coverage.capacityExcluded).toBeGreaterThan(0);
  expect(checkProposals([], view).valid).toBe(true);
  expect((await f.pool.query("SELECT * FROM supply_contracts WHERE offer_id=$1", [offer.commandId])).rowCount).toBe(0);
  await f.pool.query("UPDATE resource_balances SET ordinary_units=60000 WHERE kingdom_id=$1 AND resource='silver'", [
    x.owner.kingdomId,
  ]);
  const funded = await x.policy.observe(x.base);
  expect(funded.coordination!.focuses.map((f) => f.id)).toContain("game.supply.sign");
  expect(funded.coordination!.focuses.map((f) => f.id)).toContain("game.building.queue");
});
it("uses actual PACT quotes and commits exactly one native command with the original receipt ID", async () => {
  const x = await setup();
  expect(await x.policy.validate(x.proposal, x.view)).toMatchObject({ valid: true });
  expect(await x.policy.execute(x.proposal.intent)).toMatchObject({
    commandId: x.proposal.intent.commandId,
    code: "COMMITTED",
  });
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM building_instructions WHERE kingdom_id=$1", [x.owner.kingdomId]))
      .rows[0].n,
  ).toBe(1);
  expect(
    (
      await f.pool.query("SELECT count(*)::int n FROM command_receipts WHERE command_id=$1", [
        x.proposal.intent.commandId,
      ])
    ).rows[0].n,
  ).toBe(1);
});
it("the actual native handler rejects a changed mandate after preflight without any instruction or receipt", async () => {
  const x = await setup();
  expect(await x.policy.validate(x.proposal, x.view)).toMatchObject({ valid: true });
  await f.pool.query("UPDATE kingdom_mandates SET version=version+1,allowed_actions='{}' WHERE account_id=$1", [
    x.owner.accountId,
  ]);
  await expect(x.policy.execute(x.proposal.intent)).rejects.toMatchObject({ code: "STALE_VERSION" });
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM building_instructions WHERE kingdom_id=$1", [x.owner.kingdomId]))
      .rows[0].n,
  ).toBe(0);
  expect(
    (
      await f.pool.query("SELECT count(*)::int n FROM command_receipts WHERE command_id=$1", [
        x.proposal.intent.commandId,
      ])
    ).rows[0].n,
  ).toBe(0);
});
it("rejects a quote invalidated by a native clock tick, then accepts a fresh exact-ID proposal", async () => {
  const x = await setup();
  const now = (await f.world.read()).gameTimeMs;
  await f.settleSupply(now + 60000);
  expect(await x.policy.validate(x.proposal, x.view)).toMatchObject({ valid: false, code: "STALE_PROPOSAL" });
  const fresh = await x.policy.observe(x.base);
  const focus = fresh.coordination!.focuses.find((v) => v.id === "game.building.queue")!;
  const option = (focus.observation.options as Data[])[0];
  const proposal = {
    ...x.proposal,
    intent: {
      ...x.proposal.intent,
      commandId: String(option.commandId),
      expectedVersion: fresh.revision,
      payload: option.payload as Data,
    },
    claims: option.claims as Proposal["claims"],
    evidenceRefs: focus.sourceRefs,
  };
  expect(await x.policy.validate(proposal, fresh)).toMatchObject({ valid: true });
  expect(await x.policy.execute(proposal.intent)).toMatchObject({ code: "COMMITTED", commandId: option.commandId });
  expect(
    (
      await f.pool.query("SELECT count(*)::int n FROM command_receipts WHERE command_id=$1", [
        x.proposal.intent.commandId,
      ])
    ).rows[0].n,
  ).toBe(0);
});
it("quotes composed peer text with native byte costs and the host's original command ID", async () => {
  const x = await setup(),
    peer = await f.owner();
  const request = f.command(x.owner.principal, {
    kind: "game.contact.request",
    recipientKingdomId: peer.kingdomId,
    note: "Synthetic contact",
  });
  expect((await f.dispatcher.dispatch(x.owner.principal, request)).code).toBe("COMMITTED");
  const id = (
    await f.pool.query("SELECT id FROM cold_contact_requests WHERE sender_kingdom_id=$1 AND recipient_kingdom_id=$2", [
      x.owner.kingdomId,
      peer.kingdomId,
    ])
  ).rows[0].id;
  expect(
    (
      await f.dispatcher.dispatch(
        peer.principal,
        f.command(peer.principal, { kind: "game.contact.answer", requestId: id, accept: true }),
      )
    ).code,
  ).toBe("COMMITTED");
  x.base.payload.guide = await f.guide.read(x.owner.accountId, "start");
  const view = await x.policy.observe(x.base),
    focus = view.coordination?.focuses.find((v) => v.id === "game.message.send");
  if (!focus) throw Error("NATIVE_MESSAGE_FOCUS_REQUIRED");
  const option = (focus.observation.options as Data[])[0];
  const proposal: Proposal = {
    ...x.proposal,
    evidenceFrameRef: view.coordination!.evidenceFrameRef,
    intent: {
      ...x.proposal.intent,
      commandId: randomUUID(),
      expectedVersion: view.revision,
      payload: { ...(option.payload as Data), body: "Could we exchange grain for iron? What does your kingdom need?" },
    },
    evidenceRefs: focus.sourceRefs,
    claims: [],
  };
  const admitted = await x.policy.refreshProposal(proposal, view);
  expect(admitted.claims).not.toEqual(option.claims);
  expect(await x.policy.validate(admitted, view)).toMatchObject({ valid: true });
  expect(await x.policy.execute(admitted.intent)).toMatchObject({
    commandId: proposal.intent.commandId,
    code: "COMMITTED",
  });
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM direct_messages WHERE sender_kingdom_id=$1", [x.owner.kingdomId]))
      .rows[0].n,
  ).toBe(1);
});

it("retains the quoted command identity for native training claims through guarded commit", async () => {
  const x = await setup();
  const view = await x.policy.observe(x.base),
    focus = view.coordination!.focuses.find((v) => v.id === "game.training.queue");
  if (!focus) throw Error("NATIVE_TRAINING_FOCUS_REQUIRED");
  const option = (focus.observation.options as Data[])[0];
  const proposal: Proposal = {
    ...x.proposal,
    intent: {
      ...x.proposal.intent,
      commandId: option.commandId as string,
      expectedVersion: view.revision,
      payload: option.payload as Data,
    },
    evidenceRefs: focus.sourceRefs,
    claims: option.claims as Proposal["claims"],
  };
  expect(await x.policy.validate(proposal, view)).toMatchObject({ valid: true });
  expect(await x.policy.execute(proposal.intent)).toMatchObject({ code: "COMMITTED", commandId: option.commandId });
  expect(
    (await f.pool.query("SELECT count(*)::int n FROM training_batches WHERE kingdom_id=$1", [x.owner.kingdomId]))
      .rows[0].n,
  ).toBe(1);
});

it.each(["game.building.queue", "game.training.queue"])(
  "admits an unchanged %s proposal after a native tick using its original command ID",
  async (kind) => {
    const x = await setup();
    const focus = x.view.coordination!.focuses.find((f) => f.id === kind)!;
    const option = (focus.observation.options as Data[])[0];
    x.proposal.intent = {
      ...x.proposal.intent,
      commandId: option.commandId as string,
      payload: option.payload as Data,
    };
    x.proposal.claims = option.claims as Proposal["claims"];
    x.proposal.evidenceRefs = focus.sourceRefs;
    const now = (await f.world.read()).gameTimeMs;
    await f.settleSupply(now + 60000);
    const fresh = await x.policy.observe(x.base);
    const admitted = await x.policy.refreshProposal(x.proposal, fresh);
    expect(admitted.intent.commandId).toBe(x.proposal.intent.commandId);
    expect(await x.policy.validate(admitted, fresh)).toMatchObject({ valid: true });
    expect(await x.policy.execute(admitted.intent)).toMatchObject({
      code: "COMMITTED",
      commandId: x.proposal.intent.commandId,
    });
  },
);
