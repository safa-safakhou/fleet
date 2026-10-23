import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { negotiationPlan } from "../../../pact/tests/evaluation/negotiation-plan.js";
import { createNegotiationWorld, type NegotiationWorld } from "../../../pact/tests/evaluation/negotiation-world.js";
import { facade, nativePortCall } from "../../scripts/lib/negotiation-owned-run.js";
import { RemoteRejection } from "../../src/http.js";

const worlds: NegotiationWorld[] = [];
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close();
});
async function setup() {
  if (process.env.FLEET_ARCHITECTURE_TEST !== "1") throw Error("OWNED_PAIRED_REQUIRED");
  const pactUrl = process.env.PACT_ACCEPTANCE_DATABASE_URL,
    nonce = process.env.FLEET_ARCHITECTURE_NONCE;
  if (!pactUrl || !nonce) throw Error("OWNED_PAIRED_REQUIRED");
  const cell = negotiationPlan("E1", {
    sources: { fleet: "a".repeat(40), pact: "b".repeat(40) },
    modelDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    selectedProfile: { id: "reactive-cognition", version: "2" },
  })[0];
  const world = await createNegotiationWorld({ pactUrl, nonce }, cell);
  worlds.push(world);
  return { world, game: facade(world, 0, async () => {}) };
}
it("uses canonical scoped read schemas and refuses result-shaped arguments", async () => {
  const { game } = await setup(),
    tools = await game.tools();
  const tool = tools.find((t) => t.name === "pact_observation_read_v2");
  if (!tool) throw Error("MISSING_NATIVE_READ_TOOL");
  const schema = tool.inputSchema;
  expect(schema.required).toContain("section");
  expect(schema.additionalProperties).toBe(false);
  await expect(game.read("pact_observation_read_v2", { specialist: "resources", records: [] })).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  const page = await game.read("pact_observation_read_v2", { section: "agreements", limit: 1 });
  expect(page).toHaveProperty("records");
}, 30000);
it("preserves target, forecast and strict council cursor validation through native operations", async () => {
  const { world, game } = await setup();
  const peer = await game.read("pact_world_read_v1", {
    targetKingdomId: world.players[1].kingdomId,
    forecastMinutes: 1,
  });
  expect(peer.audience).not.toBe("owner");
  expect(peer).not.toHaveProperty("balances");
  await expect(
    game.read("pact_council_thread_v1", { kingdomId: world.players[1].kingdomId, beforeId: randomUUID() }),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(game.read("pact_world_read_v1", { forecastMinutes: 61 })).resolves.toMatchObject({
    code: "INVALID_REQUEST",
  });
}, 30000);
it("returns a typed native duplicate-contact rejection without inventing a receipt", async () => {
  const { world, game } = await setup();
  const other = facade(world, 1, async () => {});
  const first = await game.submit(randomUUID(), {
    kind: "game.contact.request",
    recipientKingdomId: world.players[1].kingdomId,
    note: "Synthetic contact",
  });
  expect(first.code).toBe("COMMITTED");
  const id = randomUUID();
  let rejected: unknown;
  try {
    await other.submit(id, {
      kind: "game.contact.request",
      recipientKingdomId: world.players[0].kingdomId,
      note: "Synthetic reciprocal",
    });
  } catch (error) {
    rejected = error;
  }
  expect(rejected).toBeInstanceOf(RemoteRejection);
  expect(rejected).toMatchObject({ code: "REQUEST_EXISTS", status: 400 });
  expect(await world.actor(world.players[1].kingdomId).receipt(id)).toBeNull();
  const actor = world.actor(world.players[1].kingdomId),
    guardedId = randomUUID();
  const command = {
    schemaVersion: "pact.command.v2" as const,
    commandId: guardedId,
    actor: {
      principalId: world.players[1].accountId,
      productScope: "pact" as const,
      audience: "agent" as const,
      subject: { type: "account" as const, id: world.players[1].accountId },
    },
    action: {
      kind: "game.contact.request" as const,
      recipientKingdomId: world.players[0].kingdomId,
      note: "Synthetic guarded reciprocal",
    },
    submittedAt: new Date().toISOString(),
  };
  const quote = await nativePortCall(() => actor.effects(command));
  await expect(
    nativePortCall(() =>
      actor.submitGuarded(command, {
        schemaVersion: "fleet.action-effects-guard.v1",
        expectedRevision: quote.revision,
        expectedEffects: quote,
      }),
    ),
  ).rejects.toMatchObject({ code: "REQUEST_EXISTS", status: 400 });
  expect(await actor.receipt(guardedId)).toBeNull();

  expect(
    (await world.pool.query("SELECT count(*)::int n FROM negotiation_fixture_commands WHERE NOT scripted_prefix"))
      .rows[0].n,
  ).toBe(1);
}, 30000);

it("does not turn arbitrary local code properties into native denials", async () => {
  const opaque = Object.assign(new Error("Synthetic transport loss"), { code: "REQUEST_EXISTS" });
  await expect(
    nativePortCall(async () => {
      throw opaque;
    }),
  ).rejects.toBe(opaque);
});

it("advertises and executes native action-effects reads with required command arguments", async () => {
  const { world, game } = await setup(),
    actor = world.actor(world.players[0].kingdomId);
  const tools = await actor.tools(true),
    quote = tools.find((t) => t.name === "pact_action_effects_quote_v1");
  expect(quote?.inputSchema.required).toContain("command");
  await expect(game.read("pact_action_effects_quote_v1", {})).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  const command = {
    schemaVersion: "pact.command.v2",
    commandId: randomUUID(),
    actor: {
      principalId: world.players[0].accountId,
      productScope: "pact",
      audience: "agent",
      subject: { type: "account", id: world.players[0].accountId },
    },
    action: {
      kind: "game.contact.request",
      recipientKingdomId: world.players[1].kingdomId,
      note: "Synthetic quote only",
    },
    submittedAt: new Date().toISOString(),
  };
  const result = await game.read("pact_action_effects_quote_v1", { command });
  expect(result.schemaVersion).toBe("fleet.action-effects.v1");
  expect(
    (await world.pool.query("SELECT count(*)::int n FROM negotiation_fixture_commands WHERE NOT scripted_prefix"))
      .rows[0].n,
  ).toBe(0);
}, 30000);

it("fits the exact native outlook-continuity read without losing any requested or continuity fact", async () => {
  const { world, game } = await setup();
  const { createPactEnvironment } = await import("../../src/environments/pact.js"),
    { expandFactTables } = await import("../../src/fact-table.js");
  const environment = createPactEnvironment({
    bindings: { agentFor: async () => "owned-actor" },
    game: async () => game,
    now: () => new Date(),
    outlookVersion: "pact.agent-outlook.v1",
  } as never);
  const session = await environment.connect({
    id: randomUUID(),
    accountRef: world.players[0].accountId,
    entityRef: world.players[0].kingdomId,
  } as never);
  try {
    const original = await session.observe({
        tool: "pact_agent_outlook_v1",
        args: {},
        continuity: true,
        coordination: true,
      }),
      before = structuredClone(original);
    const projected = session.projectObservation?.(original, { id: "specialists", version: "3" });
    if (!projected || !session.packObservation) throw Error("POLICY3_REQUIRED");
    const packed = session.packObservation(projected, 18000);
    expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThanOrEqual(18000);
    expect(expandFactTables(packed.payload.requestedRead)).toEqual(original.payload.requestedRead);
    expect(expandFactTables(packed.continuity)).toEqual(original.continuity);
    expect(packed.environmentTime).toEqual(original.environmentTime);
    expect(packed.sourceRefs).toEqual(original.sourceRefs);
    expect(original).toEqual(before);
  } finally {
    await session.close();
  }
}, 30000);
