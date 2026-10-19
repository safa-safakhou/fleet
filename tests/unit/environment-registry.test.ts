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
