import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { type Data, FleetError, type GamePort, type Tool } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import type { GameAdapter } from "../../src/game.js";
import { FakeModel, fixture, ready } from "../helpers.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
});
// A synthetic board-game integration deliberately has no kingdom/PACT tool shapes.
const adapter: GameAdapter = {
  id: "board-fixture",
  label: "Board fixture",
  instructions: "Play the authenticated board position.",
  actionKinds: ["board.move"],
  actionSchema: () => ({
    type: "object",
    properties: { kind: { const: "board.move" }, to: { type: "string" } },
    required: ["kind", "to"],
    additionalProperties: false,
  }),
  isRead: (tool) => tool.name.startsWith("board_") && tool.annotations?.readOnlyHint === true,
  async initial(game, expected) {
    const board = await game.read("board_position", {});
    if (board.playerId !== expected) throw new FleetError("IDENTITY_MISMATCH");
    return { board };
  },
  compactFacts: (facts) => facts,
  mergeReads: (reads) => reads.slice(-4),
  boundedReads: (reads) => reads.slice(-4),
  peers: () => [],
  peerReads: () => [],
  readPeer: () => undefined,
  actionPeer: () => undefined,
  normalizeCommunications: () => [],
  ownerFallback: () => false,
  rejection: () => undefined,
};
async function setup(foreign = false) {
  const f = await fixture();
  cleanup = () => f.pool.end();
  await ready(f.store, 1);
  const claim = await f.store.claim("board-test");
  if (!claim) throw Error("NO_CLAIM");
  const submitted: { id: string; action: Data }[] = [],
    readNames: string[] = [];
  const tools: Tool[] = [
    { name: "board_position", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
    { name: "board_admin", inputSchema: { type: "object" }, annotations: { readOnlyHint: false } },
  ];
  const game: GamePort = {
    profile: async () => ({ accountId: String(claim.agent.account_id) }),
    tools: async () => tools,
    read: async (name) => {
      readNames.push(name);
      return { playerId: foreign ? randomUUID() : claim.agent.kingdom_id, pieces: ["rook"] };
    },
    open: async () => {},
    close: async () => {},
    submit: async (id, action) => {
      submitted.push({ id, action });
      return { commandId: id, code: "COMMITTED" };
    },
    receipt: async (id) => ({ commandId: id, code: "RECEIPT_NOT_FOUND" }),
  };
  return { ...f, claim, game, submitted, readNames };
}
it("runs a second game through the same admission, accounting and receipt engine", async () => {
  const f = await setup(),
    model = new FakeModel([
      { kind: "read", tool: "board_position", args: {}, summary: "Inspect pieces" },
      { kind: "action", action: { kind: "board.move", to: "a4" }, summary: "Move rook" },
      { kind: "wait", summary: "Wait for opponent" },
    ]);
  await new Engine(f.store, model, async () => f.game, true, adapter).run(f.claim);
  expect(f.submitted).toHaveLength(1);
  expect(f.submitted[0].action).toEqual({ kind: "board.move", to: "a4" });
  expect(f.readNames.every((name) => name === "board_position")).toBe(true);
  const state = await f.store.publicState();
  expect(state.turns[0].actions).toBe(1);
  expect(state.turns[0].pending_command).toBeNull();
  expect(state.turns[0].calls).toBe(3);
});
it("rejects a foreign game entity before reserving any model call", async () => {
  const f = await setup(true),
    model = new FakeModel();
  await new Engine(f.store, model, async () => f.game, true, adapter).run(f.claim);
  const turn = (await f.store.publicState()).turns[0];
  expect(turn.code).toBe("IDENTITY_MISMATCH");
  expect(turn.calls).toBe(0);
  expect(f.submitted).toHaveLength(0);
});
it("adapter selection cannot turn a write tool into an authorized read", async () => {
  const f = await setup(),
    model = new FakeModel([{ kind: "read", tool: "board_admin", args: {}, summary: "Invalid read" }]);
  await new Engine(f.store, model, async () => f.game, true, { ...adapter, isRead: () => true }).run(f.claim);
  const refusal = JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0];
  expect(refusal.code).toBe("READ_TOOL_FORBIDDEN");
  expect(refusal.availableReads).not.toContain("board_admin");
  expect((await f.store.publicState()).turns[0].code).toBe("WAIT");
  expect(f.readNames).not.toContain("board_admin");
});
