import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { afterEach, expect, it } from "vitest";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
it("delivers a closed provider schema once and safely corrects an invented name within its existing allowance", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  await ready(f.store, 1);
  const claim = await f.store.claim("generation");
  if (!claim) throw Error("missing claim");
  const bad = { kind: "read", tool: "pact_conversation_read_v2", args: {}, summary: "Invalid fixture" };
  const model = new FakeModel([bad, { kind: "wait", summary: "Corrected" }]),
    game = new FakeGame(claim);
  await new Engine(f.store, model, async () => game, true).run(claim);
  const input = model.inputs[0];
  if (!input) throw Error("missing model input");
  expect(new Ajv({ strict: false, validateFormats: false }).compile(input.schema)(bad)).toBe(false);
  const context = JSON.parse(input.messages[1].content);
  expect(context.decisionSchema).toBeUndefined();
  expect(context.suppliedActionSchemas).toBeUndefined();
  expect(context.suppliedReadSchemas).toBeUndefined();
  expect(model.inputs).toHaveLength(2);
  expect(JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0].code).toBe("READ_TOOL_FORBIDDEN");
  expect(game.submits).toEqual([]);
});
it("a reviewed schema lookup admits a valid additional action on the next bounded decision", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  await ready(f.store, 1);
  const claim = await f.store.claim("lookup");
  if (!claim) throw Error("missing claim");
  const action = {
    kind: "action",
    summary: "Valid synthetic offer",
    action: {
      kind: "game.garrison.offer",
      hostKingdomId: randomUUID(),
      expiryMinutes: 60,
      terms: { units: [{ type: "spearman", count: 1 }], durationHours: 6, lenderBond: null, hostBond: null },
    },
  };
  const model = new FakeModel([
    {
      kind: "read",
      tool: "fleet_action_schema",
      args: { kind: "game.garrison.offer" },
      summary: "Inspect exact shape",
    },
    action,
    { kind: "wait", summary: "Done" },
  ]);
  const game = new FakeGame(claim);
  await new Engine(f.store, model, async () => game, true).run(claim);
  const check = (n: number) => new Ajv({ strict: false, validateFormats: false }).compile(model.inputs[n].schema);
  expect(check(0)(action)).toBe(false);
  expect(check(1)(action)).toBe(true);
  expect(game.submits).toHaveLength(1);
});

it("busy-slot feedback and an explicit schema lookup cannot restore the rejected legacy arguments", async () => {
  const f = await fixture();
  cleanup = () => f.pool.end();
  await ready(f.store, 1);
  const claim = await f.store.claim("busy-correction");
  if (!claim) throw Error("missing claim");
  const game = new FakeGame(claim),
    original = game.read.bind(game);
  game.read = async (name, args) =>
    name === "pact_world_read_v1"
      ? {
          ...(await original(name, args)),
          buildings: [
            { kind: "farm", level: 1 },
            { kind: "hall", level: 1 },
          ],
          builders: [
            { slot: 1, state: "waiting", kind: "hall", targetLevel: 2 },
            { slot: 2, state: null },
          ],
        }
      : original(name, args);
  const bad = {
    kind: "action",
    action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
    summary: "Fixture ignores grammar",
  };
  const good = { ...bad, action: { ...bad.action, slot: 2 } };
  const model = new FakeModel([
    bad,
    {
      kind: "read",
      tool: "fleet_action_schema",
      args: { kind: "game.building.queue" },
      summary: "Inspect corrected arguments",
    },
    good,
  ]);
  await new Engine(f.store, model, async () => game, true).run(claim);
  expect(model.inputs).toHaveLength(3);
  for (const input of model.inputs) {
    const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
    expect(check(bad)).toBe(false);
    expect(check(good)).toBe(true);
    expect(check({ ...good, action: { ...good.action, building: "hall" } })).toBe(false);
  }
  const correction = JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0];
  expect(correction).toMatchObject({
    code: "OBSERVED_WAITING_SLOT_BUSY",
    attemptedReferences: { building: "farm", slot: 1 },
  });
  expect(game.submits).toHaveLength(1);
  expect(game.submits[0].action).toEqual(good.action);
  expect((await f.store.publicState()).turns[0]).toMatchObject({ state: "finished", code: "COMMITTED", actions: 1 });
});
