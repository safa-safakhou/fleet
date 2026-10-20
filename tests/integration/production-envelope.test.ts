import { readFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { Cognition } from "../../src/cognition.js";
import type { Data, ModelPort } from "../../src/domain.js";
import { object } from "../../src/domain.js";
import { Engine } from "../../src/engine.js";
import { expandFactTables } from "../../src/fact-table.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { expandSchemaFeedback } from "../../src/schema-feedback.js";
import { validateTool } from "../../src/tools.js";
import { FakeGame, fixture, ready } from "../helpers.js";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
});
it.each([
  [false, "action"],
  [true, "action"],
  [true, "cognitive_plan"],
  [true, "cognitive_memories"],
  [false, "continuation"],
] as const)(
  "fits the deployed packet cognition=%s lookup=%s with executable requested shapes",
  async (cognition, lookup) => {
    const f = await fixture();
    close = () => f.pool.end();
    const id = await ready(f.store, 1);
    await f.pool.query(
      "UPDATE cohorts SET budget=jsonb_set(budget,'{maxCallsPerTurn}','2'),owner_guidance='account_autonomy',observation_consent=true WHERE id=$1",
      [id],
    );
    if (cognition)
      await f.pool.query(
        `UPDATE cohorts SET model=model||'{"cognition":"llm-centered-v1","recallAssist":"laya-recall-v1"}'::jsonb WHERE id=$1`,
        [id],
      );
    const environment = JSON.parse(await readFile("tests/fixtures/production-envelope-shape.json", "utf8"));
    const catalog = JSON.parse(await readFile("tests/fixtures/production-read-catalog.json", "utf8"));
    const bodies: Data[] = [];
    let calls = 0;
    const model: ModelPort = {
      decide: async (input) => {
        const context = expandSchemaFeedback(JSON.parse(input.messages[1].content), input.schema);
        bodies.push(context);
        const requestedResult = object(object(context.requestedRead).result);
        expect(
          Buffer.byteLength(JSON.stringify(input.messages)) + Buffer.byteLength(JSON.stringify(input.schema)),
        ).toBeLessThanOrEqual(24000);
        for (const field of [
          "profile",
          "balances",
          "buildings",
          "builders",
          "nextUpgradeChecks",
          "constructionRecovery",
          "authority",
          "mandate",
          "goalFeasibility",
          "socialDelegation",
        ])
          expect(object(expandFactTables(context.environment))[field]).toEqual(environment[field]);
        expect(object(object(context.environment).publicDiscovery).players).not.toHaveLength(0);
        const socialRecords = object(object(context.environment).socialAttention).records;
        expect(Array.isArray(socialRecords) ? socialRecords[0] : undefined).toEqual(
          environment.socialAttention.records[0],
        );
        const decision =
          calls++ % 2 === 0
            ? {
                kind: "read",
                tool: lookup === "action" ? "fleet_action_schema" : "fleet_continuation_schema",
                args: lookup === "action" ? { kind: "game.building.queue" } : { section: lookup },
                summary: "Inspect the exact shape",
              }
            : { kind: "wait", summary: "Wait on current verified facts" };
        const wrapped = cognition
          ? {
              cognition: {
                expectedVersion: object(context.cognition).version,
                analysis: { type: "none", reason: "No new verified change" },
                ...(calls % 2 === 0 && lookup === "cognitive_plan" ? { plan: null } : {}),
                ...(calls % 2 === 0 && lookup === "cognitive_memories" ? { memories: [] } : {}),
              },
              decision,
            }
          : decision;
        validateTool({ name: "generated", inputSchema: input.schema }, wrapped);
        if (calls % 2 === 0 && lookup === "action") {
          expect(object(context.requestedRead).tool).toBe("fleet_action_schema");
          expect(requestedResult.schema).toEqual(pactAdapter.proposalSchema?.("game.building.queue", {}));
          const action = {
            kind: "action",
            action: { kind: "game.building.queue", building: "farm", targetLevel: 2, slot: 1 },
            summary: "Only a schema control, never submitted",
          };
          validateTool(
            { name: "requested-shape", inputSchema: input.schema },
            cognition ? { ...wrapped, decision: action } : action,
          );
        }
        if (calls % 2 === 0 && lookup !== "action") {
          expect(object(context.requestedRead).tool).toBe("fleet_continuation_schema");
          if (lookup === "continuation")
            expect(object(object(requestedResult.schema).properties).expectedVersion).toBeDefined();
          else {
            const field = lookup === "cognitive_plan" ? "plan" : "memories";
            expect(object(object(object(input.schema.properties).cognition).properties)[field]).toBeDefined();
            expect(requestedResult.schemaAtOutput).toBe(`/properties/cognition/properties/${field}`);
          }
        }
        return { decision: wrapped, inputTokens: 500, outputTokens: 100 };
      },
    };
    for (let round = 0; round < 3; round++) {
      const claim = await f.store.claim("production-envelope");
      if (!claim) throw Error("claim");
      const game = new FakeGame(claim),
        originalTools = game.tools.bind(game);
      game.tools = async () => [
        ...(await originalTools()).filter((t) => !catalog.some((r: Data) => r.name === t.name)),
        ...catalog,
      ];
      const originalRead = game.read.bind(game);
      game.read = async (tool, args) =>
        tool === "pact_observation_read_v2"
          ? {
              section: "social_attention",
              ownerKingdomId: claim.agent.kingdom_id,
              asOfGameTimeMs: 60000,
              records: [],
              coverage: { complete: true },
              next: null,
            }
          : originalRead(tool, args);
      const adapter = { ...pactAdapter, compactFacts: () => structuredClone(environment) };
      const support = new Cognition(f.store);
      if (cognition)
        for (let n = 0; n < 8; n++)
          await support.capture(claim, "observation", `shape:${round}:${n}`, {
            summary: "Synthetic history ".repeat(90),
            evidenceRefs: [],
            importance: 3,
          });
      await new Engine(f.store, model, async () => game, true, adapter, undefined, undefined, support).run(claim);
      expect((await f.pool.query("SELECT code,calls FROM turns WHERE id=$1", [claim.id])).rows[0]).toEqual({
        code: "WAIT",
        calls: 2,
      });
      expect(game.submits).toEqual([]);
      f.advance(900000);
    }
    expect(calls).toBe(6);
    if (cognition) expect(bodies.some((body) => String(body.schemaCoverage).includes("paged"))).toBe(true);
    expect((await f.pool.query("SELECT count(*)::int n FROM compute_ledger WHERE status='unknown'")).rows[0].n).toBe(0);
  },
  30000, // Three offline scheduled rounds include the bounded packing search.
);
