import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { deliveredCognition } from "../../src/cognition.js";
import { analysisInstructions, analysisOpportunities, analysisSchemaForVersion } from "../../src/cognitive-analysis.js";
import { fitMessages } from "../../src/context.js";
import { type Data, object } from "../../src/domain.js";
import { expandFactTables, factTable } from "../../src/fact-table.js";
import { pactAdapter } from "../../src/games/pact/adapter.js";
import { bindGenerationSchema, closedDecisionSchema } from "../../src/generation.js";
import { expandOpportunityText, expandSchemaFeedback } from "../../src/schema-feedback.js";
import { validateTool } from "../../src/tools.js";

it("round-trips whole map/list facts, sparse missing values, nulls and original outcome keys", () => {
  const rows = Array.from({ length: 5 }, (_, n) => ({
    turnId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    decision: 0,
    category: "interrupted",
    code: "CONTEXT_LIMIT",
    submitted: false,
    meaning: "Known noncommit ".repeat(20),
    ...(n % 2 ? { parameters: null } : { other: { state: "known", value: null } }),
  })).map((r) => ({ ...r, key: `${r.turnId}:${r.decision}:${r.category}` }));
  for (const value of [rows, Object.fromEntries(rows.map((row, n) => [String(n), row]))]) {
    const encoded = factTable(value);
    expect(Buffer.byteLength(JSON.stringify(encoded))).toBeLessThan(Buffer.byteLength(JSON.stringify(value)));
    expect(expandFactTables(JSON.parse(JSON.stringify(encoded)))).toEqual(value);
  }
});

it.each([
  [false, "production-populated-cognition"],
  [true, "production-populated-cognition"],
  [false, "production-largest-cognition"],
  [true, "production-largest-cognition"],
] as const)(
  "fits both populated-memory decisions and later rounds accepted=%s shape=%s",
  async (accepted, shape) => {
    const original = JSON.parse(await readFile(`tests/fixtures/${shape}.json`, "utf8"));
    const unchanged = JSON.stringify(original);
    const catalog = JSON.parse(await readFile("tests/fixtures/production-read-catalog.json", "utf8")).filter(
      pactAdapter.isRead,
    );
    let outcomes = original.continuation.outcomes;
    let calls = 0;
    for (let round = 0; round < 3; round++) {
      const context = structuredClone(original);
      const failure = [...outcomes]
        .reverse()
        .find((o: Data) =>
          ["not_submitted", "rejected", "ordinary_read_failure", "uncertain"].includes(String(o.category)),
        );
      context.continuation.outcomes = outcomes.slice(-3);
      if (failure && !context.continuation.outcomes.includes(failure)) context.continuation.outcomes.unshift(failure);
      const pair =
        context.cognition.recall.candidateIds ??
        context.cognition.evidence
          .filter((e: Data) => ["message", "receipt"].includes(String(e.kind)))
          .slice(0, 2)
          .map((e: Data) => e.id);
      if (accepted) {
        expect(pair).toHaveLength(2);
        context.cognition.recall = {
          route: "laya-recall-v1",
          admission: "accepted",
          candidateIds: pair,
          selectedId: pair[0],
          role: "Advisory recall order only; no command authority.",
        };
      } else context.cognition.recall = { route: "relevance-recency-importance" };
      for (let step = 0; step < 2; step++) {
        const shapes = step ? [pactAdapter.actionSchema("game.building.queue")] : [];
        const generation = closedDecisionSchema({
          actionKinds: context.gameActionKinds,
          actionSchemas: shapes,
          reads: catalog,
          selectedReadNames: [],
          memory: true,
          continuationLookup: true,
        });
        const schemaForContext = (c: Data) =>
          bindGenerationSchema(
            analysisSchemaForVersion(context.cognition.version, deliveredCognition(c), {
              plan: false,
              memories: false,
            }),
            generation,
          );
        const messages = fitMessages(
          context,
          `${pactAdapter.instructions} ${analysisInstructions}`,
          schemaForContext(context),
          24000,
          pactAdapter.boundedReads,
          pactAdapter.narrowRead,
          pactAdapter.compactEnvironment,
          schemaForContext,
        );
        const delivered = JSON.parse(messages[1].content),
          schema = schemaForContext(delivered),
          environment = object(expandFactTables(delivered.environment));
        expect(
          Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(schema)),
        ).toBeLessThanOrEqual(24000);
        expect(expandFactTables(delivered.actionPermissions)).toEqual(context.actionPermissions);
        for (const key of [
          "profile",
          "authority",
          "mandate",
          "socialDelegation",
          "balances",
          "buildings",
          "builders",
          "nextUpgradeChecks",
          "goalFeasibility",
          "constructionRecovery",
        ])
          expect(environment[key]).toEqual(context.environment[key]);
        const social = object(environment.socialAttention),
          records = social.records as Data[];
        if (context.environment.socialAttention.records.length)
          expect(records[0]).toEqual(context.environment.socialAttention.records[0]);
        for (const record of records) expect(context.environment.socialAttention.records).toContainEqual(record);
        expect(object(social.coverage).omittedFromThisInput ?? 0).toBe(
          context.environment.socialAttention.records.length - records.length,
        );
        expect(object(expandOpportunityText(delivered, schema).cognition).analysisOpportunities).toEqual(
          analysisOpportunities(deliveredCognition(delivered)),
        );
        const deliveredIds = delivered.cognition.evidence.map((e: Data) => e.id);
        for (const id of context.cognition.analysisEvidenceIds) expect(deliveredIds).toContain(id);
        if (accepted) {
          expect(delivered.cognition.recall.candidateIds).toEqual(pair);
          expect(delivered.cognition.recall.selectedId).toBe(pair[0]);
          for (const id of pair) expect(deliveredIds).toContain(id);
        }
        const retainedOutcomes = object(expandFactTables(delivered.continuation)).outcomes as Data[];
        for (const old of context.continuation.outcomes.filter(
          (o: Data) => o.category !== "read" && o.category !== "wait",
        ))
          expect(retainedOutcomes).toContainEqual(old);
        if (step)
          expect(object(object(expandSchemaFeedback(delivered, schema).requestedRead).result).schema).toEqual(
            pactAdapter.actionSchema("game.building.queue"),
          );
        const decision = step
          ? { kind: "wait", summary: "Wait on current facts" }
          : {
              kind: "read",
              tool: "fleet_action_schema",
              args: { kind: "game.building.queue" },
              summary: "Read the exact shape",
            };
        const fake = {
          cognition: {
            expectedVersion: context.cognition.version,
            analysis: { type: "none", reason: "No new verified insight" },
          },
          decision,
        };
        validateTool({ name: "fake-provider", inputSchema: schema }, fake);
        calls++;
        const turnId = `00000000-0000-4000-8000-${String(1000 + round).padStart(12, "0")}`;
        const outcome = {
          category: step ? "wait" : "read",
          code: step ? "WAIT" : "READ",
          ...(!step ? { tool: "fleet_action_schema", parameters: { kind: "game.building.queue" } } : {}),
          turnId,
          decision: step,
          key: `${turnId}:${step}:${step ? "wait" : "read"}`,
          recordedAt: "2026-10-11T12:00:00.000Z",
          meaning: "Recorded controller outcome, not hidden reasoning or command authority.",
        };
        context.continuation.outcomes.push(outcome);
        if (!step)
          context.requestedRead = {
            tool: "fleet_action_schema",
            args: { kind: "game.building.queue" },
            result: { schema: pactAdapter.actionSchema("game.building.queue") },
            observedAt: "2026-10-11T12:00:00.000Z",
          };
      }
      outcomes = context.continuation.outcomes;
    }
    expect(calls).toBe(6);
    expect(JSON.stringify(original)).toBe(unchanged);
  },
  30000,
);
