import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { ParticipantMessages } from "../../src/app/participant-messaging.js";
import { SpecialistRepository } from "../../src/app/participant-services.js";
import { transaction } from "../../src/db.js";
import { ParticipantDelivery } from "../../src/platform/participant-delivery.js";
import { evaluateWake } from "../../src/platform/wake-conditions.js";
import { launchFixture } from "../fixtures/architecture-launch.js";

let f: Awaited<ReturnType<typeof launchFixture>>;
afterEach(async () => {
  await f?.close();
});
async function setup() {
  f = await launchFixture(false);
  await f.store.consent(f.id, true);
  await f.tasks.enroll(f.id, { id: "fixture", version: "2" });
  const binding = await f.tasks.bindings.forAgent(f.agent);
  if (!binding) throw Error("BINDING_REQUIRED");
  const scope = { instanceId: `${binding.id}:fixture@2`, bindingId: binding.id, specialistId: "resources" };
  const base = new SpecialistRepository(f.store, scope);
  await base.initialize(
    ["resources", "diplomacy"].map((id) => ({
      id,
      revision: 1,
      responsibility: id,
      priority: 1,
      allowedActions: [],
      maxActiveGoals: 8,
    })),
  );
  const event = {
    id: randomUUID(),
    type: "contract_changed",
    sourceRef: "contract:1",
    observedAt: f.now().toISOString(),
    environmentTime: { clockId: "utc", value: f.now().toISOString() },
    metadata: { category: "contract", groupRef: "current" },
  };
  const [taskId] = await transaction(f.pool, (db) =>
    new ParticipantDelivery(f.tasks).ingestWithin(db, binding, event, [
      { participantId: "resources", taskKey: "current", subscriptionVersion: "1" },
    ]),
  );
  const delivery = (await f.pool.query("SELECT * FROM specialist_deliveries WHERE task_id=$1", [taskId])).rows[0];
  const messages = new ParticipantMessages(f.store, f.tasks, binding, scope.instanceId, {
    taskId,
    deliveryIds: [delivery.id],
    clock: event.environmentTime,
  });
  const repository = new SpecialistRepository(f.store, scope, async () => {}, messages.acceptWithin.bind(messages));
  const envelope = {
    goals: [],
    memories: [],
    predictions: [],
    plan: null,
    deliveryIds: [delivery.id],
    messages: [
      {
        to: "diplomacy",
        kind: "request",
        text: "Check the current agreement",
        evidenceIds: [],
        parentDeliveryId: delivery.id,
      },
    ],
    wakeConditions: [],
  };
  return { repository, messages, scope, envelope, delivery, binding, taskId };
}
it("normalizes a same-envelope request index and derives reply correlation from the actual received request", async () => {
  const s = await setup();
  await s.repository.accept(s.scope, {
    expectedVersion: 0,
    operationId: randomUUID(),
    envelope: {
      ...s.envelope,
      wakeConditions: [
        {
          kind: "reply",
          requestIndex: 0,
          deadline: { clockId: "utc", value: new Date(f.now().getTime() + 60000).toISOString() },
        },
      ],
    },
  });
  const request = (await f.pool.query("SELECT * FROM specialist_outbox")).rows[0];
  await s.messages.deliverOutbox(8, new AbortController().signal);
  const received = (await f.pool.query("SELECT * FROM specialist_deliveries WHERE recipient='diplomacy'")).rows[0];
  const reply = new ParticipantMessages(f.store, f.tasks, s.binding, s.scope.instanceId, {
    taskId: received.task_id,
    deliveryIds: [received.id],
    clock: { clockId: "utc", value: f.now().toISOString() },
  });
  const peer = { ...s.scope, specialistId: "diplomacy" };
  const repo = new SpecialistRepository(f.store, peer, async () => {}, reply.acceptWithin.bind(reply));
  await repo.accept(peer, {
    expectedVersion: 0,
    operationId: randomUUID(),
    envelope: {
      ...s.envelope,
      deliveryIds: [received.id],
      messages: [
        {
          to: "resources",
          kind: "reply",
          text: "Here is the requested assessment",
          evidenceIds: [],
          parentDeliveryId: received.id,
        },
      ],
    },
  });
  await reply.deliverOutbox(8, new AbortController().signal);
  const result = (
    await f.pool.query("SELECT * FROM specialist_deliveries WHERE recipient='resources' AND event_id LIKE 'internal:%'")
  ).rows[0];
  expect(
    f.store.vault.decrypt<{ metadata: { replyToRequestId: string } }>(
      result.detail_cipher,
      `specialist-delivery:${s.scope.instanceId}:${s.binding.id}:resources:${result.id}`,
    ).metadata.replyToRequestId,
  ).toBe(request.id);
  expect(
    await s.messages.evaluateWakes(
      { replies: [request.id] },
      { clockId: "utc", value: f.now().toISOString() },
      new AbortController().signal,
    ),
  ).toBe(1);
});
it("commits state, acknowledgments and addressed outbox atomically and resumes delivery once", async () => {
  const { repository, messages, scope, envelope, delivery } = await setup();
  const input = { expectedVersion: 0, operationId: randomUUID(), envelope };
  await repository.accept(scope, input);
  await repository.accept(scope, input);
  expect(
    (await f.pool.query("SELECT status FROM specialist_deliveries WHERE id=$1", [delivery.id])).rows[0].status,
  ).toBe("acknowledged");
  expect((await f.pool.query("SELECT * FROM specialist_outbox")).rowCount).toBe(1);
  expect(await messages.deliverOutbox(10, new AbortController().signal)).toBe(1);
  expect(await messages.deliverOutbox(10, new AbortController().signal)).toBe(0);
  const reply = (await f.pool.query("SELECT * FROM specialist_deliveries WHERE recipient='diplomacy'")).rows[0];
  expect(reply.root_id).toBe(delivery.root_id);
  expect(reply.depth).toBe(1);
});
it("rejects a ninth message, foreign recipient or fabricated parent with no partial acknowledgment", async () => {
  const { repository, scope, envelope, delivery } = await setup();
  for (const outgoing of [
    Array.from({ length: 9 }, () => envelope.messages[0]),
    [{ ...envelope.messages[0], to: "foreign" }],
    [{ ...envelope.messages[0], parentDeliveryId: randomUUID() }],
  ])
    await expect(
      repository.accept(scope, {
        expectedVersion: 0,
        operationId: randomUUID(),
        envelope: { ...envelope, messages: outgoing },
      }),
    ).rejects.toThrow();
  expect((await repository.load(scope)).version).toBe(0);
  expect((await f.pool.query("SELECT * FROM specialist_outbox")).rowCount).toBe(0);
  expect(
    (await f.pool.query("SELECT status FROM specialist_deliveries WHERE id=$1", [delivery.id])).rows[0].status,
  ).toBe("pending");
});
it("does not invent a fresh root or continue beyond depth or conflict bounds", async () => {
  const { repository, scope, envelope, delivery } = await setup();
  await f.pool.query("UPDATE specialist_deliveries SET depth=4 WHERE id=$1", [delivery.id]);
  await expect(repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope })).rejects.toThrow(
    "MESSAGE_CHAIN_LIMIT",
  );
  await expect(
    repository.accept(scope, {
      expectedVersion: 0,
      operationId: randomUUID(),
      envelope: { ...envelope, messages: [{ ...envelope.messages[0], rootId: randomUUID() }] },
    }),
  ).rejects.toThrow();
});
it("preserves durable waits across restart and treats an unavailable clock as unknown", async () => {
  const { repository, messages, scope, envelope } = await setup();
  const dueAt = { clockId: "utc", value: new Date(f.now().getTime() + 60000).toISOString() };
  const waiting = { kind: "deadline", at: dueAt };
  await repository.accept(scope, {
    expectedVersion: 0,
    operationId: randomUUID(),
    envelope: { ...envelope, messages: [], wakeConditions: [waiting] },
  });
  expect(evaluateWake(waiting, {}, undefined)).toBe("unknown");
  expect(
    await messages.evaluateWakes({}, { clockId: "utc", value: f.now().toISOString() }, new AbortController().signal),
  ).toBe(0);
  f.advance(60000);
  expect(
    await messages.evaluateWakes({}, { clockId: "utc", value: f.now().toISOString() }, new AbortController().signal),
  ).toBe(1);
  expect(
    await messages.evaluateWakes({}, { clockId: "utc", value: f.now().toISOString() }, new AbortController().signal),
  ).toBe(0);
  const state = await new SpecialistRepository(f.store, scope).load(scope);
  expect(state.version).toBe(1);
});
it("rejects a third conflict round inherited from the actual parent", async () => {
  const { repository, scope, envelope, delivery } = await setup();
  const aad = `specialist-delivery:${scope.instanceId}:${scope.bindingId}:${scope.specialistId}:${delivery.id}`;
  const event = f.store.vault.decrypt<{ metadata: Record<string, unknown> }>(delivery.detail_cipher, aad);
  event.metadata.conflictRound = 2;
  await f.pool.query("UPDATE specialist_deliveries SET detail_cipher=$2 WHERE id=$1", [
    delivery.id,
    f.store.vault.encrypt(event, aad),
  ]);
  await expect(
    repository.accept(scope, {
      expectedVersion: 0,
      operationId: randomUUID(),
      envelope: { ...envelope, messages: [{ ...envelope.messages[0], kind: "conflict" }] },
    }),
  ).rejects.toThrow("CONFLICT_ROUND_LIMIT");
  expect((await repository.load(scope)).version).toBe(0);
});
it("evaluates only registered predicates and does not equate a missing reply with refusal", () => {
  expect(
    evaluateWake(
      { kind: "predicate", name: "arbitrary_js", version: "1", args: {} },
      {},
      { clockId: "utc", value: "2026-10-11T12:00:00Z" },
    ),
  ).toBe("unknown");
  expect(
    evaluateWake(
      { kind: "reply", requestId: randomUUID(), deadline: { clockId: "utc", value: "2026-10-11T12:00:00Z" } },
      { replies: [] },
      { clockId: "utc", value: "2026-10-11T13:00:00Z" },
    ),
  ).toBe("ready");
});
it("applies visible critical-event backpressure without losing the first delivery", async () => {
  const { binding } = await setup();
  const delivery = new ParticipantDelivery(f.tasks, { concerns: 2, critical: 2 });
  const event = {
    id: randomUUID(),
    type: "command_result",
    sourceRef: "receipt:2",
    observedAt: f.now().toISOString(),
    environmentTime: { clockId: "utc", value: f.now().toISOString() },
    metadata: { category: "result", groupRef: "result" },
  };
  await transaction(f.pool, (db) =>
    delivery.ingestWithin(db, binding, event, [
      { participantId: "resources", taskKey: "result:2", subscriptionVersion: "1" },
    ]),
  );
  await expect(
    transaction(f.pool, (db) =>
      delivery.ingestWithin(db, binding, { ...event, id: randomUUID() }, [
        { participantId: "resources", taskKey: "result:3", subscriptionVersion: "1" },
      ]),
    ),
  ).rejects.toThrow("CRITICAL_INBOX_BACKPRESSURE");
  expect((await f.pool.query("SELECT * FROM specialist_deliveries WHERE recipient='resources'")).rowCount).toBe(2);
});
it("redacts internal message material on consent withdrawal", async () => {
  const { repository, messages, scope, envelope } = await setup();
  await repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope });
  await messages.deliverOutbox(10, new AbortController().signal);
  await f.store.consent(f.id, false);
  expect(
    (await f.pool.query("SELECT payload_cipher FROM specialist_outbox")).rows.every((x) => x.payload_cipher === null),
  ).toBe(true);
  expect(
    (await f.pool.query("SELECT detail_cipher FROM specialist_deliveries")).rows.every((x) => x.detail_cipher === null),
  ).toBe(true);
});
it("does not deliver expired private messages even before maintenance runs", async () => {
  const { repository, messages, scope, envelope } = await setup();
  await repository.accept(scope, { expectedVersion: 0, operationId: randomUUID(), envelope });
  f.advance(31 * 86400000);
  await messages.deliverOutbox(10, new AbortController().signal);
  expect((await f.pool.query("SELECT * FROM specialist_deliveries WHERE recipient='diplomacy'")).rowCount).toBe(0);
});
it("acknowledges unavailable expired metadata without allowing it to ground a new message", async () => {
  const { repository, scope, envelope, delivery } = await setup();
  f.advance(31 * 86400000);
  expect(
    (
      await repository.accept(scope, {
        expectedVersion: 0,
        operationId: randomUUID(),
        envelope: { ...envelope, messages: [] },
      })
    ).accepted,
  ).toBe(true);
  expect(
    (await f.pool.query("SELECT status FROM specialist_deliveries WHERE id=$1", [delivery.id])).rows[0].status,
  ).toBe("acknowledged");
  await expect(repository.accept(scope, { expectedVersion: 1, operationId: randomUUID(), envelope })).rejects.toThrow(
    "MESSAGE_PARENT_REQUIRED",
  );
});
