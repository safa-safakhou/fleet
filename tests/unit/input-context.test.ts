import { expect, it } from "vitest";
import { fitMessages } from "../../src/context.js";
import { decisionSchema } from "../../src/domain.js";
import { boundedReads } from "../../src/games/pact/context.js";

it("fits an expanded starting context and large dated history without dropping current peers, action schemas or receipts", () => {
  const peers = Array.from({ length: 8 }, (_, n) => ({
    kingdomId: `observed-peer-${n}`,
    handle: `fixture-${n}`,
    displayName: `Fictional peer ${n}`,
  }));
  const schema = {
    type: "object",
    properties: {
      kind: { const: "game.contact.request" },
      recipientKingdomId: { type: "string" },
      note: { type: "string" },
    },
  };
  const context = {
    environment: {
      publicDiscovery: { players: peers },
      rules: { firstContact: "Introductions are free", lesson: "Whole rule ".repeat(550) },
    },
    suppliedActionSchemas: [schema],
    commandResults: [{ commandId: "original-fixture-command", receipt: { code: "COMMITTED" } }],
    availableReads: Array.from({ length: 30 }, (_, n) => ({
      name: `fixture_read_${n}`,
      description: "Read description ".repeat(12),
    })),
    decisionSchema,
    readResults: Array.from({ length: 4 }, (_, n) => ({
      tool: `fixture_read_${n}`,
      args: {},
      result: { body: "界".repeat(1800) },
      observedAt: "2026-10-11T12:00:00Z",
    })),
  };
  const messages = fitMessages(context, "Choose freely; no invented identities.", decisionSchema, 16000, boundedReads);
  expect(
    Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema)),
  ).toBeLessThanOrEqual(16000);
  const kept = JSON.parse(messages[1].content);
  expect(kept.environment.publicDiscovery.players).toEqual(peers);
  expect(kept.suppliedActionSchemas).toEqual([schema]);
  expect(kept.commandResults).toEqual(context.commandResults);
  expect(kept.omissions[0]).toContain("dated cache");
});
it("counts the separate output schema before choosing compaction, and refuses an oversized indispensable body before inference", () => {
  const context = {
    environment: { id: "observed-id" },
    availableReads: [{ name: "fixture_read", description: "x".repeat(2000) }],
    readResults: [],
    decisionSchema,
  };
  const full = [
      { role: "system", content: "Choose" },
      { role: "user", content: JSON.stringify(context) },
    ],
    limit = Buffer.byteLength(JSON.stringify(full)) + 100;
  const messages = fitMessages(context, "Choose", decisionSchema, limit, boundedReads);
  expect(JSON.parse(messages[1].content).availableReads[0]).toEqual({ name: "fixture_read" });
  expect(
    Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(decisionSchema)),
  ).toBeLessThanOrEqual(limit);
  expect(() =>
    fitMessages(
      { ...context, commandResults: [{ receipt: { body: "x".repeat(30000) } }] },
      "Choose",
      decisionSchema,
      2000,
      boundedReads,
    ),
  ).toThrow("CONTEXT_LIMIT");
});
