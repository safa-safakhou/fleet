import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { GamePort } from "../../src/domain.js";
import { pactEvents } from "../../src/games/pact/events.js";

function eventGame(): GamePort {
  return {
    profile: async () => ({ accountId: "fixture" }),
    tools: async () => [],
    read: async () => ({}),
    open: async () => {},
    submit: async () => ({}),
    receipt: async () => ({}),
    close: async () => {},
  };
}

it("requires the scoped versioned feed and never falls back to a human stream", async () => {
  const game = eventGame();
  await expect(pactEvents(game, null, () => new Date())).rejects.toThrow("UNSUPPORTED_CAPABILITY");
});
it("maps publication metadata and authoritative game deadlines without peer bodies", async () => {
  const game = eventGame();
  game.tools = async () => [
    { name: "pact_agent_events_v1", annotations: { readOnlyHint: true }, inputSchema: { type: "object" } },
  ];
  game.read = async () => ({
    schemaVersion: "pact.agent-events.v1",
    events: [
      {
        sequence: "3",
        eventId: randomUUID(),
        type: "raid.declared.v1",
        sourceRef: "outbox:" + randomUUID(),
        occurredAt: "2026-10-17T12:00:00.000Z",
        publishedAt: "2026-10-17T12:01:00.000Z",
        gameTime: "0",
        deadline: { gameTime: "900000", kind: "battle_lock" },
        metadata: { category: "raid", groupRef: "raid:fixture", recordRef: "raid:fixture" },
      },
    ],
    nextCursor: "opaque",
    resyncRequired: false,
  });
  const p = await pactEvents(game, "old", () => new Date("2026-10-17T12:02:00Z"));
  expect(p).toMatchObject({
    fromCursor: "old",
    nextCursor: "opaque",
    events: [{ deadline: { clockId: "pact.game-time-ms", value: "900000" }, metadata: { publicationSequence: "3" } }],
  });
});
it("rejects unexpected body fields and invalid resync envelopes", async () => {
  const game = eventGame();
  game.tools = async () => [
    { name: "pact_agent_events_v1", annotations: { readOnlyHint: true }, inputSchema: { type: "object" } },
  ];
  game.read = async () => ({
    schemaVersion: "pact.agent-events.v1",
    events: [],
    nextCursor: null,
    resyncRequired: true,
  });
  await expect(pactEvents(game, null, () => new Date())).rejects.toThrow("INVALID_EVENT_PAGE");
});
