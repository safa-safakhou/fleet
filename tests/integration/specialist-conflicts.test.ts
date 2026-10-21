import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { ParticipantConflicts } from "../../src/app/participant-conflicts.js";
import { transaction } from "../../src/db.js";
import { resolveConflict } from "../../src/engines/autonomous-specialists/conflicts.js";
import { actionIntentDigest } from "../../src/platform/action-effects.js";
import { ParticipantDelivery } from "../../src/platform/participant-delivery.js";
import { platformFixture } from "../platform-helpers.js";

let end: (() => Promise<void>) | undefined;
afterEach(async () => {
  await end?.();
  end = undefined;
});
const quote = (id: string, key = "stock", units = "6") => ({
  id,
  specialistId: id,
  goalIds: [],
  intent: { commandId: randomUUID(), bindingId: "binding", schemaId: "board.move.v1", payload: { to: id } },
  effects: {
    schemaVersion: "fleet.action-effects.v1" as const,
    revision: "source:1",
    intentDigest: "0".repeat(64),
    actionKey: "board.move.v1",
    claims: [{ kind: "resource" as const, schemaId: "tokens.v1", key, units }],
    capacities: [{ schemaId: "tokens.v1", key, remainingUnits: "10" }],
    sourceRefs: ["current:stock"],
    validUntil: { clockId: "utc", value: "2026-10-11T13:00:00Z" },
    coverage: { complete: true, omitted: [] },
    supported: true,
  },
});
const policy = {
  version: "owner:1",
  priorities: {} as Record<string, number>,
  obligationIntentIds: [] as string[],
  deadlines: {} as Record<string, { at: string; sourceRef: string }>,
  pendingCommandIds: [] as string[],
};
it("admits unrelated compatible work without coordinator reasoning", () => {
  expect(resolveConflict({ round: 0, intents: [quote("a", "iron"), quote("b", "silver")] }, policy)).toMatchObject({
    kind: "admit",
    eligibleIntentIds: ["a", "b"],
  });
});
it("uses explicit owner priorities and authoritative deadlines while ignoring urgent peer prose", () => {
  const a = { ...quote("a"), urgent: "very urgent" },
    b = quote("b");
  expect(resolveConflict({ round: 0, intents: [a, b] }, { ...policy, priorities: { a: 2, b: 1 } })).toMatchObject({
    kind: "admit",
    eligibleIntentIds: ["a"],
  });
  expect(
    resolveConflict(
      { round: 0, intents: [a, b] },
      { ...policy, deadlines: { b: { at: "2026-10-11T12:01:00Z", sourceRef: "signed-obligation:1" } } },
    ),
  ).toMatchObject({ kind: "admit", eligibleIntentIds: ["b"] });
});
it("bounds unresolved peer revision and preserves actor-wide uncertainty protection", () => {
  const intents = [quote("a"), quote("b")];
  expect(resolveConflict({ round: 0, intents }, policy).kind).toBe("negotiate");
  expect(resolveConflict({ round: 2, intents }, policy)).toMatchObject({
    kind: "blocked",
    reason: "CONFLICT_ROUND_LIMIT",
  });
  expect(resolveConflict({ round: 0, intents }, { ...policy, pendingCommandIds: ["unknown-command"] })).toMatchObject({
    kind: "blocked",
    reason: "PENDING_COMMAND",
  });
});
it("retains one root and version across unchanged conflict publication and caps changed proposals", async () => {
  const f = await platformFixture();
  end = () => f.pool.end();
  await f.store.consent(f.group.id, true);
  const binding = f.group.bindings[0],
    instanceId = `${binding.id}:fixture-loop@1`;
  const [taskId] = await transaction(f.pool, (db) =>
    new ParticipantDelivery(f.tasks).ingestWithin(
      db,
      binding,
      {
        id: "external:1",
        type: "resource_changed",
        sourceRef: "current:stock",
        observedAt: f.now().toISOString(),
        environmentTime: { clockId: "utc", value: f.now().toISOString() },
        metadata: { category: "resource", groupRef: "stock" },
      },
      [{ participantId: "a", subscriptionVersion: "1", taskKey: "stock" }],
    ),
  );
  const conflicts = new ParticipantConflicts(f.store, f.tasks, binding, instanceId),
    scope = { instanceId, bindingId: binding.id, specialistId: "a" };
  const proposals = [quote("a"), quote("b")].map((p) => {
    p.intent.bindingId = binding.id;
    p.effects.intentDigest = actionIntentDigest(p.intent);
    return p;
  });
  const first = await conflicts.publish(scope, { taskId, intents: proposals, policy });
  const repeated = await conflicts.publish(scope, {
    taskId,
    intents: proposals.map((p) => ({ ...p, intent: { ...p.intent, commandId: randomUUID() } })),
    policy,
  });
  expect(repeated.id).toBe(first.id);
  expect(repeated.rootId).toBe(first.rootId);
  expect(repeated.round).toBe(first.round);
  for (let i = 0; i < 3; i++) {
    proposals[0].intent.payload.to = `changed:${i}`;
    await conflicts.publish(scope, { taskId, intents: proposals, policy });
  }
  const final = (await conflicts.list(scope))[0];
  expect(final.round).toBe(2);
  expect(final.result.reason).toBe("CONFLICT_ROUND_LIMIT");
  expect(final.rootId).toBe(first.rootId);
  expect((await f.pool.query("SELECT * FROM specialist_conflicts")).rowCount).toBe(1);
});
it("rotates eligible participants so a repeatedly coalesced development concern cannot starve a peer", async () => {
  const f = await platformFixture();
  end = () => f.pool.end();
  const binding = f.group.bindings[0],
    delivery = new ParticipantDelivery(f.tasks);
  const event = (id: string) => ({
    id,
    type: "changed",
    sourceRef: id,
    observedAt: f.now().toISOString(),
    environmentTime: { clockId: "utc", value: f.now().toISOString() },
    metadata: { category: "resource", groupRef: id },
  });
  const add = (role: string, id: string) =>
    transaction(f.pool, (db) =>
      delivery.ingestWithin(db, binding, event(id), [{ participantId: role, subscriptionVersion: "1", taskKey: role }]),
    );
  const [development] = await add("development", "development:1");
  await add("diplomacy", "peer:1");
  const first = await f.tasks.claim("fairness", f.now(), development);
  if (!first) throw Error("CLAIM_REQUIRED");
  await add("development", "development:2");
  await f.tasks.finish(first, "WAIT");
  const next = await f.tasks.claim("fairness", f.now());
  if (!next) throw Error("CLAIM_REQUIRED");
  expect((await f.tasks.get(next.taskId)).participantId).toBe("diplomacy");
});
