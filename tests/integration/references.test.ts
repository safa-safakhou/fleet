import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { RemoteRejection } from "../../src/http.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
for (const placeholder of [true, false])
  it(`ordinary ${placeholder ? "placeholder" : "absent"} receipt lookup does not create a pending command or interrupted turn`, async () => {
    const f = await fixture();
    close = () => f.pool.end();
    await ready(f.store, 1);
    const claim = await f.store.claim("references");
    if (!claim) throw Error("claim");
    const game = new FakeGame(claim),
      originalTools = game.tools.bind(game),
      originalRead = game.read.bind(game);
    game.tools = async () => [
      ...(await originalTools()),
      {
        name: "pact_receipt_read_v1",
        inputSchema: {
          type: "object",
          properties: { commandId: { type: "string" } },
          required: ["commandId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
    ];
    game.read = async (tool, args) => {
      if (tool === "pact_receipt_read_v1") {
        game.reads.push({ tool, args });
        throw new RemoteRejection("RECEIPT_NOT_FOUND", 200);
      }
      return originalRead(tool, args);
    };
    const model = new FakeModel([
      {
        kind: "read",
        tool: "pact_receipt_read_v1",
        args: { commandId: placeholder ? "00000000-0000-0000-0000-000000000000" : randomUUID() },
        summary: "Inspect synthetic receipt",
      },
      { kind: "wait", summary: "No original pending command exists" },
    ]);
    await new Engine(f.store, model, async () => game, true).run(claim);
    expect(model.inputs).toHaveLength(2);
    expect(JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0]).toMatchObject({
      code: "RECEIPT_NOT_FOUND",
      submitted: false,
    });
    expect(game.reads.filter((r) => r.tool === "pact_receipt_read_v1")).toHaveLength(placeholder ? 0 : 1);
    expect(game.opened).toBe(0);
    expect(game.submits).toEqual([]);
    expect(
      (await f.pool.query("SELECT code,pending_command,actions FROM turns WHERE id=$1", [claim.id])).rows[0],
    ).toMatchObject({ code: "WAIT", pending_command: null, actions: 0 });
  });
