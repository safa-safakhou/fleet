import { afterEach, expect, it } from "vitest";
import { type Data, object } from "../../src/domain.js";
import { Observability } from "../../src/observability.js";
import { Store } from "../../src/store.js";
import { FakeGame, FakeModel, fixture, ready } from "../helpers.js";
import { Engine } from "../pact-engine.js";

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => cleanup?.());
async function setup() {
  const f = await fixture();
  cleanup = () => f.pool.end();
  const id = await ready(f.store, 1);
  await f.store.consent(id, true);
  const claim = await f.store.claim("p1-fixture");
  if (!claim) throw Error("Missing claim");
  return { ...f, id, claim, game: new FakeGame(claim) };
}
it("delivers a fresh tiny inbox result and fresh guide despite eight large old cache entries", async () => {
  const f = await setup();
  const history = Array.from({ length: 8 }, (_, n) => ({
    tool: n < 4 ? "fleet_read_schema" : `pact_fixture_${n}`,
    args: { name: `fixture_${n}` },
    result: { body: "界".repeat(850) },
    observedAt: f.now().toISOString(),
  }));
  await f.store.rememberReads(f.claim, history);
  const claim = { ...f.claim, agent: await f.store.agent(f.claim.agentId) };
  f.game.tools = async () => [
    ...(await new FakeGame(claim).tools()),
    {
      name: "pact_inbox_read_v1",
      inputSchema: { type: "object" },
      annotations: { readOnlyHint: true },
    },
  ];
  const original = f.game.read.bind(f.game);
  const inbox = { messages: [], requests: [], fixture: "fresh-55-byte" };
  f.game.read = async (tool, args) => (tool === "pact_inbox_read_v1" ? inbox : original(tool, args));
  const model = new FakeModel([
    { kind: "read", tool: "pact_inbox_read_v1", args: {}, summary: "Read inbox" },
    { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "diplomacy" }, summary: "Read rules" },
    { kind: "wait", summary: "Wait" },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(claim);
  expect(model.inputs).toHaveLength(3);
  expect(JSON.parse(model.inputs[1].messages[1].content).requestedRead.result).toEqual(inbox);
  expect(JSON.parse(model.inputs[2].messages[1].content).requestedRead.args).toEqual({ topic: "diplomacy" });
  for (const input of model.inputs)
    expect(
      Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
    ).toBeLessThanOrEqual(24000);
  expect(f.game.opened).toBe(0);
});
it("round trips eight encrypted entries through a new Store, deduplicates/evicts by category and rejects stale writes", async () => {
  const f = await setup();
  const history = Array.from({ length: 8 }, (_, n) => ({
    tool: n < 4 ? "fleet_read_schema" : `pact_fixture_${n}`,
    args: { name: `fixture_${n}` },
    result: { n },
    observedAt: f.now().toISOString(),
  }));
  await f.store.rememberReads(f.claim, history);
  const restarted = new Store(f.pool, f.store.vault, f.now);
  const agent = await restarted.agent(f.claim.agentId);
  if (!agent.read_memory_cipher) throw Error("Missing checkpoint");
  expect(restarted.vault.decrypt(agent.read_memory_cipher, `read-memory:${agent.id}`)).toEqual(history);
  const claim = { ...f.claim, agent };
  const model = new FakeModel([
    { kind: "read", tool: "fleet_read_schema", args: { name: "pact_world_read_v1" }, summary: "New knowledge" },
    { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "start" }, summary: "Fresh state" },
    { kind: "wait", summary: "Wait" },
  ]);
  await new Engine(restarted, model, async () => f.game, true).run(claim);
  expect(JSON.parse(model.inputs[0].messages[1].content).readResults).toHaveLength(8);
  const saved = await restarted.agent(agent.id);
  if (!saved.read_memory_cipher) throw Error("Missing checkpoint");
  const entries = restarted.vault.decrypt<Data[]>(saved.read_memory_cipher, `read-memory:${agent.id}`);
  expect(entries).toHaveLength(8);
  expect(entries.some((e) => object(e.args).name === "fixture_0")).toBe(false);
  expect(entries.some((e) => e.tool === "pact_fixture_4")).toBe(false);
  expect(entries.filter((e) => e.tool === "pact_agent_guide_v1")).toHaveLength(1);
  await expect(restarted.rememberReads(f.claim, [])).rejects.toThrow("CLAIM_FENCED");
  await expect(restarted.rememberReads(f.claim, [...history, history[0]])).rejects.toThrow("READ_MEMORY_LIMIT");
  expect(saved.account_id).toBe(agent.account_id);
  expect(saved.kingdom_id).toBe(agent.kingdom_id);
  expect((await restarted.publicState()).turns[0].calls).toBe(3);
});
it("records sanitized invalid read arguments and field errors, permits correction only inside the existing budget", async () => {
  const f = await setup();
  const model = new FakeModel([
    {
      kind: "read",
      tool: "pact_world_read_v1",
      args: { forecastMinutes: 99, token: "fixture-secret" },
      summary: "Invalid forecast",
    },
    { kind: "read", tool: "pact_world_read_v1", args: { forecastMinutes: 15 }, summary: "Correct forecast" },
    { kind: "wait", summary: "Wait" },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  const feedback = JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0];
  expect(JSON.parse(model.inputs[0].messages[1].content).suppliedReadSchemas).toContainEqual({
    name: "pact_world_read_v1",
    inputSchema: (await f.game.tools()).find((t) => t.name === "pact_world_read_v1")?.inputSchema,
  });
  expect(feedback.inputSchema).toEqual(
    (await f.game.tools()).find((t) => t.name === "pact_world_read_v1")?.inputSchema,
  );
  expect(feedback.attemptedArgs).toEqual({ forecastMinutes: 99, token: "[redacted]" });
  expect(feedback.schemaDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(feedback.errors[0].instancePath).toBe("/forecastMinutes");
  expect(f.game.reads.some((r) => r.args.forecastMinutes === 99)).toBe(false);
  expect(f.game.reads.some((r) => r.args.forecastMinutes === 15)).toBe(true);
  const inspection = await new Observability(f.store).inspect(f.claim.agentId);
  expect(JSON.stringify(inspection)).not.toContain("fixture-secret");
  expect(inspection.turns[0].events.some((e) => e.label === "Read arguments rejected before submission")).toBe(true);
  expect(inspection.turns[0].calls).toBe(3);
  expect(f.game.opened).toBe(0);
});
it("a busy current guide cannot starve requested feedback or a permitted response, without buying extra calls or modifying memory", async () => {
  const f = await setup(),
    original = f.game.read.bind(f.game);
  const requestId = "00000000-0000-4000-8000-000000000001";
  f.game.read = async (tool, args) =>
    tool === "pact_agent_guide_v1"
      ? {
          contacts: [],
          mandate: { allowedActions: ["contact.answer"] },
          socialDelegation: { mode: "agent_decides" },
          contactRequests: Array.from({ length: 80 }, (_, n) => ({
            id: n === 0 ? requestId : `fixture-${n}`,
            direction: "incoming",
            note: '\\"界'.repeat(100),
          })),
        }
      : original(tool, args);
  const model = new FakeModel([
    { kind: "read", tool: "pact_world_read_v1", args: {}, summary: "Fresh world" },
    {
      kind: "action",
      action: { kind: "game.contact.answer", requestId, accept: true },
      summary: "Respond to the observed request",
    },
    { kind: "wait", summary: "Wait" },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  expect(model.inputs).toHaveLength(3);
  for (const input of model.inputs)
    expect(
      Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
    ).toBeLessThanOrEqual(24000);
  expect(JSON.parse(model.inputs[1].messages[1].content).requestedRead.result.profile.kingdomId).toBe(
    f.claim.agent.kingdom_id,
  );
  expect(JSON.parse(model.inputs[0].messages[1].content).environment.coverage.complete).toBe(false);
  expect(f.game.submits).toHaveLength(1);
  expect(f.game.submits[0].action).toEqual({ kind: "game.contact.answer", requestId, accept: true });
  expect((await f.store.publicState()).turns[0].actions).toBe(1);
});
it("uses newly requested owned levels for the subsequent preflight without rebinding identity", async () => {
  const f = await setup();
  let worldReads = 0;
  const original = f.game.read.bind(f.game);
  f.game.read = async (tool, args) =>
    tool === "pact_world_read_v1"
      ? { profile: { kingdomId: f.claim.agent.kingdom_id }, buildings: [{ kind: "farm", level: ++worldReads }] }
      : original(tool, args);
  const model = new FakeModel([
    { kind: "read", tool: "pact_world_read_v1", args: {}, summary: "Fresh levels" },
    {
      kind: "action",
      action: { kind: "game.building.queue", building: "farm", targetLevel: 3, slot: 1 },
      summary: "Use fresh level",
    },
    { kind: "wait", summary: "Wait" },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  expect(f.game.submits).toHaveLength(1);
  expect(f.game.submits[0].action.targetLevel).toBe(3);
  expect((await f.store.agent(f.claim.agentId)).kingdom_id).toBe(f.claim.agent.kingdom_id);
});
it("expires individual old reads even when their encrypted checkpoint was saved recently", async () => {
  const f = await setup();
  await f.store.rememberReads(f.claim, [
    { tool: "pact_fixture_old", args: {}, result: { marker: "expired-fixture" }, observedAt: "2026-10-09T12:00:00Z" },
    { tool: "pact_fixture_new", args: {}, result: { marker: "current-fixture" }, observedAt: f.now().toISOString() },
  ]);
  const claim = { ...f.claim, agent: await f.store.agent(f.claim.agentId) };
  const model = new FakeModel();
  await new Engine(f.store, model, async () => f.game, true).run(claim);
  expect(model.inputs[0].messages[1].content).toContain("current-fixture");
  expect(model.inputs[0].messages[1].content).not.toContain("expired-fixture");
});
it("delivers a read requested on the final decision to the next scheduled decision after restart", async () => {
  const f = await setup();
  const model = new FakeModel([
    { kind: "read", tool: "fleet_read_schema", args: { name: "pact_world_read_v1" }, summary: "Inspect world args" },
    { kind: "read", tool: "pact_agent_guide_v1", args: { topic: "diplomacy" }, summary: "Rules" },
    {
      kind: "read",
      tool: "pact_world_read_v1",
      args: { forecastMinutes: 15 },
      summary: "Final decision requests facts",
    },
  ]);
  await new Engine(f.store, model, async () => f.game, true).run(f.claim);
  const a = await f.store.agent(f.claim.agentId);
  if (!a.read_memory_cipher) throw Error("Missing checkpoint");
  expect(
    f.store.vault.decrypt<Data[]>(a.read_memory_cipher, `read-memory:${a.id}`).filter((r) => r.requested),
  ).toHaveLength(1);
  f.advance(900000);
  const restarted = new Store(f.pool, f.store.vault, f.now);
  const claim = await restarted.claim("restarted");
  if (!claim) throw Error("Missing scheduled claim");
  const next = new FakeModel();
  await new Engine(restarted, next, async () => new FakeGame(claim), true).run(claim);
  expect(JSON.parse(next.inputs[0].messages[1].content).requestedRead).toMatchObject({
    tool: "pact_world_read_v1",
    args: { forecastMinutes: 15 },
    observedAt: "2026-10-11T12:00:00.000Z",
  });
  expect(next.inputs).toHaveLength(1);
  const consumed = await restarted.agent(claim.agentId);
  if (!consumed.read_memory_cipher) throw Error("Missing consumed checkpoint");
  expect(
    restarted.vault.decrypt<Data[]>(consumed.read_memory_cipher, `read-memory:${consumed.id}`).some((r) => r.requested),
  ).toBe(false);
});
it.each(["game.building.cancel", "game.training.cancel", "game.troop.disband", "game.garrison.seize"])(
  "%s cannot open a lease or fall back to an owner without policy",
  async (kind) => {
    const f = await setup();
    let ownerCalls = 0;
    const model = new FakeModel([
      { kind: "action", action: { kind, instructionId: "fixture-id" }, summary: "Requires human" },
      { kind: "wait", summary: "Wait for owner" },
    ]);
    await new Engine(f.store, model, async () => f.game, true, {
      prepare: async (_c, a) => {
        ownerCalls++;
        return a;
      },
      submit: async () => {
        ownerCalls++;
        throw Error("Must not submit");
      },
    }).run(f.claim);
    expect(f.game.opened).toBe(0);
    expect(f.game.submits).toHaveLength(0);
    expect(ownerCalls).toBe(0);
    expect(JSON.parse(model.inputs[1].messages[1].content).decisionFeedback[0].code).toBe("HUMAN_DECISION_REQUIRED");
    expect((await f.store.publicState()).turns[0].pending_command).toBeNull();
  },
);
