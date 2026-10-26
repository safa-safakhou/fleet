import { expect, it, vi } from "vitest";
import { EnvironmentRegistry } from "../../src/platform/environment-registry.js";
import { boardEnvironment, boardRef } from "../fixtures/environments/board.js";

const binding = {
  id: "binding:red",
  environment: boardRef,
  accountRef: "player:red",
  actorRef: "seat:red",
  entityRef: "board:room-east",
};
it("refuses foreign, closed or unregistered sessions when borrowing execution authority", async () => {
  const board = boardEnvironment(),
    registry = new EnvironmentRegistry([board.adapter], boardRef);
  const session = await registry.connect(binding);
  expect(() => registry.assertSession(session, binding)).not.toThrow();
  expect(() => registry.assertSession(session, { ...binding, id: "binding:other" })).toThrow(
    "ENVIRONMENT_SESSION_MISMATCH",
  );
  expect(() => registry.assertSession({ ...session }, binding)).toThrow("ENVIRONMENT_SESSION_MISMATCH");
  await session.close();
  expect(() => registry.assertSession(session, binding)).toThrow("ENVIRONMENT_SESSION_MISMATCH");
});
it("forwards immutable specialist action restrictions through the scoped environment boundary", async () => {
  const board = boardEnvironment(),
    connect = board.adapter.connect;
  board.adapter.connect = async (b) => ({
    ...(await connect(b)),
    actionContracts: async (_observation, keys) => [
      {
        schemaId: "board.move.v1",
        payloadSchema: { type: "object", properties: { move: { enum: keys ?? ["unrestricted"] } } },
      },
    ],
  });
  const session = await new EnvironmentRegistry([board.adapter], boardRef).connect(binding),
    observation = await session.observe({});
  expect(await session.actionContracts?.(observation, ["step"])).toEqual([
    { schemaId: "board.move.v1", payloadSchema: { type: "object", properties: { move: { enum: ["step"] } } } },
  ]);
  expect(await session.actionContracts?.(observation, [])).toEqual([
    { schemaId: "board.move.v1", payloadSchema: { type: "object", properties: { move: { enum: [] } } } },
  ]);
  await session.close();
});
it("resolves only reviewed versions within the selected environment", () => {
  const board = boardEnvironment(),
    registry = new EnvironmentRegistry([board.adapter], boardRef);
  expect(registry.resolve(boardRef)).toBe(board.adapter);
  expect(() => registry.resolve({ ...boardRef, version: "2" })).toThrow("UNSUPPORTED_ENVIRONMENT");
  expect(() => registry.resolve({ ...boardRef, instanceId: "other-instance" })).toThrow("ENVIRONMENT_NOT_SELECTED");
  expect(() => new EnvironmentRegistry([board.adapter, board.adapter], boardRef)).toThrow("DUPLICATE_ENVIRONMENT");
});
it("refuses missing capabilities before model dispatch", async () => {
  const board = boardEnvironment(),
    registry = new EnvironmentRegistry([board.adapter], boardRef),
    model = vi.fn();
  await expect(
    (async () => {
      await registry.connect(binding, { eventDelivery: ["native", "poll"], social: true });
      model();
    })(),
  ).rejects.toThrow("UNSUPPORTED_CAPABILITY");
  expect(model).not.toHaveBeenCalled();
  expect(board.connections).toBe(0);
  await expect(registry.connect(binding, {}, { observations: ["board.position.v2"] })).rejects.toThrow(
    "UNSUPPORTED_SCHEMA",
  );
  expect(board.connections).toBe(0);
});
it("runs an opaque command and receipt cycle without social requirements", async () => {
  const board = boardEnvironment(),
    registry = new EnvironmentRegistry([board.adapter], boardRef),
    session = await registry.connect(binding);
  const before = await session.observe({});
  expect(before.payload).toEqual({ seat: "seat:red", square: "a1" });
  const intent = {
    commandId: "command/move-1",
    bindingId: binding.id,
    schemaId: "board.move.v1",
    payload: { to: "a4" },
  };
  expect(await session.execute(intent)).toMatchObject({ status: "confirmed", code: "MOVED" });
  expect(await session.resolve(intent.commandId)).toMatchObject({ status: "confirmed" });
  await session.execute(intent);
  expect(board.executions).toBe(1);
  expect((await session.observe({})).payload.square).toBe("a4");
  expect(await session.resolve("lost-command")).toMatchObject({ status: "unknown" });
  expect(JSON.stringify([before, await session.catalog()])).not.toMatch(/kingdom|pact_|Court/);
  await expect(session.execute({ ...intent, bindingId: "foreign" })).rejects.toThrow("BINDING_MISMATCH");
  await expect(session.execute({ ...intent, schemaId: "board.move.v2" })).rejects.toThrow("UNSUPPORTED_SCHEMA");
  await session.close();
});

it("resolves descriptors independently of object key insertion order", () => {
  const board = boardEnvironment();
  board.adapter.ref = { version: "1", id: "board" };
  const registry = new EnvironmentRegistry([board.adapter], boardRef);
  expect(registry.resolve(boardRef)).toBe(board.adapter);
});
it("reports unavailable outcome lookup as unknown without querying or replaying", async () => {
  const board = boardEnvironment();
  board.adapter.capabilities.outcomeLookup = false;
  const registry = new EnvironmentRegistry([board.adapter], boardRef),
    session = await registry.connect(binding);
  expect(await session.resolve("lost-command")).toMatchObject({
    status: "unknown",
    code: "OUTCOME_LOOKUP_UNAVAILABLE",
  });
  expect(board.executions).toBe(0);
});
it("requires explicit complete-effect capability and its actual quote protocol", async () => {
  const board = boardEnvironment(),
    registry = new EnvironmentRegistry([board.adapter], boardRef);
  await expect(registry.connect(binding, { actionEffects: true })).rejects.toThrow("UNSUPPORTED_CAPABILITY");
  board.adapter.capabilities.actionEffects = true;
  await expect(registry.connect(binding, { actionEffects: true })).rejects.toThrow("ACTION_EFFECTS_PROTOCOL_REQUIRED");
  expect(board.executions).toBe(0);
});

it("round-trips fresh-admission evidence through the native adapter and rejects foreign scope", async () => {
  const board = boardEnvironment(),
    connect = board.adapter.connect;
  const refresh = vi.fn(
    async (
      proposal: import("../../src/platform/contracts.js").Proposal,
      observation: import("../../src/platform/contracts.js").Observation,
    ) => {
      expect(proposal.evidenceRefs).toEqual(observation.sourceRefs);
      expect(observation.sourceRefs.every((ref) => !ref.startsWith("["))).toBe(true);
      return proposal;
    },
  );
  board.adapter.connect = async (b) => ({ ...(await connect(b)), refreshProposal: refresh });
  const session = await new EnvironmentRegistry([board.adapter], boardRef).connect(binding);
  const observation = await session.observe({});
  const proposal = {
    taskId: "task",
    intent: { commandId: "command", bindingId: binding.id, schemaId: "board.move.v1", payload: { to: "a2" } },
    evidenceRefs: observation.sourceRefs,
    expectedOutcome: {},
    claims: [],
    conflicts: [],
  };
  expect((await session.refreshProposal!(proposal, observation)).evidenceRefs).toEqual(observation.sourceRefs);
  for (const ref of [
    "unscoped",
    JSON.stringify([boardRef.id, boardRef.version, boardRef.instanceId, "foreign-actor", binding.entityRef, "source"]),
  ])
    await expect(session.refreshProposal!({ ...proposal, evidenceRefs: [ref] }, observation)).rejects.toThrow(
      "UNSCOPED_EVIDENCE",
    );
  expect(refresh).toHaveBeenCalledTimes(1);
  await session.close();
});
