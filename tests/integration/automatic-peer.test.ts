import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { RemoteRejection } from "../../src/http.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
for (const [code, status, known] of [
  ["NOT_CONTACT", 200, true],
  ["BLOCKED", 403, true],
  ["FORBIDDEN", 403, true],
  ["HTTP_503", 503, false],
] as const)
  it(`automatic peer read ${code} preserves ordinary failure versus server uncertainty`, async () => {
    const f = await fixture();
    close = () => f.pool.end();
    await ready(f.store, 1);
    const claim = await f.store.claim("peer");
    if (!claim) throw Error("claim");
    const game = new FakeGame(claim),
      original = game.read.bind(game),
      peer = randomUUID();
    game.read = async (tool, args) => {
      if (tool === "pact_agent_guide_v1") return { ...(await original(tool, args)), contacts: [{ kingdomId: peer }] };
      if (tool === "pact_council_thread_v1") throw new RemoteRejection(code, status);
      return original(tool, args);
    };
    const model = new FakeModel();
    await new Engine(f.store, model, async () => game, true).run(claim);
    expect(model.inputs).toHaveLength(known ? 1 : 0);
    expect(game.submits).toEqual([]);
    expect(game.opened).toBe(0);
    const row = (await f.pool.query("SELECT code,pending_command,actions FROM turns WHERE id=$1", [claim.id])).rows[0];
    expect(row.pending_command).toBeNull();
    expect(row.actions).toBe(0);
    expect(row.code).toBe(known ? "WAIT" : code);
    if (known)
      expect(JSON.parse(model.inputs[0].messages[1].content).decisionFeedback[0]).toMatchObject({
        code,
        tool: "pact_council_thread_v1",
        submitted: false,
      });
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger")).rows[0].n).toBe(known ? 1 : 0);
  });
