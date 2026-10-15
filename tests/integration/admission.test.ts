import { afterEach, expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { RemoteRejection } from "../../src/http.js";
import { FakeGame, FakeModel, fixture, ready, tools } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
it("delivers a selected quote, then retains a racing allowance rejection without replay or authority change", async () => {
  const f = await fixture();
  close = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.pool.query(`UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','2') WHERE id=$1`, [id]);
  const claim = await f.store.claim("quote");
  if (!claim) throw Error("claim");
  const game = new FakeGame(claim),
    read = game.read.bind(game);
  game.tools = async () => [
    ...tools,
    {
      name: "pact_decision_support_v2",
      inputSchema: { type: "object", properties: { candidateId: { type: "string" } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
  ];
  game.read = async (t, a) =>
    t === "pact_decision_support_v2"
      ? {
          candidate: {
            id: "observed-current",
            action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
            checks: {
              admissionQuote: {
                schemaVersion: "pact.construction-quote.v1",
                mandateVersion: 1,
                resources: {
                  iron: { headroomUnits: "600000", requiredReservationUnits: "24000", reserveFloorUnits: "0" },
                },
                admission: { allowed: true, blockers: [] },
                immediateStart: { possible: true, blockers: [] },
              },
            },
          },
        }
      : read(t, a);
  let submitted = 0;
  game.submit = async () => {
    submitted++;
    throw new RemoteRejection("INSUFFICIENT_ALLOWANCE", 400);
  };
  const model = new FakeModel([
    {
      kind: "read",
      tool: "pact_decision_support_v2",
      args: { candidateId: "observed-current" },
      summary: "Inspect actual quote",
    },
    {
      kind: "action",
      action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
      summary: "Choose quoted action",
    },
  ]);
  const before = await f.store.cohort(id);
  await new Engine(f.store, model, async () => game, true, pactAdapter).run(claim);
  const input = JSON.parse(model.inputs[1].messages[1].content);
  expect(input.requestedRead.result.candidate.checks.admissionQuote.admission.allowed).toBe(true);
  expect(submitted).toBe(1);
  expect((await f.store.publicState()).turns[0]).toMatchObject({
    code: "INSUFFICIENT_ALLOWANCE",
    pending_command: null,
    actions: 0,
  });
  f.advance(900000);
  const next = await f.store.claim("quote-restart");
  if (!next) throw Error("claim");
  const after = new FakeModel();
  await new Engine(f.store, after, async () => new FakeGame(next), true, pactAdapter).run(next);
  expect(JSON.parse(after.inputs[0].messages[1].content).decisionFeedback).toMatchObject([
    {
      code: "INSUFFICIENT_ALLOWANCE",
      committed: false,
      submitted: true,
    },
  ]);
  const current = await f.store.cohort(id);
  expect(current.budget).toEqual(before.budget);
  expect(current.model).toEqual(before.model);
  for (const v of [...model.inputs, ...after.inputs])
    expect(
      Buffer.byteLength(JSON.stringify(v.messages)) + Buffer.byteLength(JSON.stringify(v.schema)),
    ).toBeLessThanOrEqual(24000);
});
