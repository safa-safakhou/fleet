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
      kind: "game.supply.offer",
      counterpartyKingdomId: randomUUID(),
      expiryMinutes: 60,
      terms: {
        aToB: { resource: "grain", wholePerHour: 10 },
        bToA: null,
        aBond: null,
        bBond: null,
        durationHours: 6,
        noticeHours: 0,
      },
    },
  };
  const model = new FakeModel([
    { kind: "read", tool: "fleet_action_schema", args: { kind: "game.supply.offer" }, summary: "Inspect exact shape" },
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
