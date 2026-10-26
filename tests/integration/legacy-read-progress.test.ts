import { expect, it } from "vitest";
import { Engine } from "../../src/engine.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";

it("feeds back an already delivered schema and executes only the model's subsequent explicit read", async () => {
  const f = await fixture();
  try {
    await ready(f.store, 1);
    const claim = (await f.store.claim("read-progress"))!;
    const game = new FakeGame(claim),
      model = new FakeModel([
        {
          kind: "read",
          tool: "fleet_read_schema",
          args: { name: "pact_world_read_v1" },
          summary: "Inspect the schema",
        },
        { kind: "read", tool: "pact_world_read_v1", args: { forecastMinutes: 1 }, summary: "Read current state" },
        { kind: "wait", summary: "Deliberate pacing" },
      ]);
    const reads: { tool: string; args: unknown }[] = [],
      read = game.read.bind(game);
    game.read = async (tool, args) => {
      reads.push({ tool, args });
      return read(tool, args);
    };
    await new Engine(f.store, model, async () => game, true, pactAdapter).run(claim);
    expect(model.inputs).toHaveLength(3);
    expect(JSON.parse(model.inputs[1].messages[1].content).decisionFeedback).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "READ_SCHEMA_ALREADY_DELIVERED", tool: "pact_world_read_v1" }),
      ]),
    );
    expect(
      reads.filter(
        (r) => r.tool === "pact_world_read_v1" && (r.args as { forecastMinutes?: number }).forecastMinutes === 1,
      ),
    ).toHaveLength(1);
    expect(game.opened).toBe(0);
    expect((await f.pool.query("SELECT status FROM compute_ledger")).rows).toEqual(
      Array.from({ length: 3 }, () => ({ status: "reported" })),
    );
  } finally {
    await f.pool.end();
  }
});
