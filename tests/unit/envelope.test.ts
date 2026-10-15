import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { analysisSchemaForVersion } from "../../src/cognitive-analysis.js";
import { fitMessages } from "../../src/context.js";
import { type Data, object } from "../../src/domain.js";
import { boundedReads, narrowRead, projectRead } from "../../src/games/pact/context.js";
import { actionSchema } from "../../src/games/pact/contracts.js";
import { compactEnvironment } from "../../src/games/pact/environment.js";
import { bindGenerationSchema, closedDecisionSchema } from "../../src/generation.js";

const artifact = JSON.parse(await readFile("vendor/pact-observations.json", "utf8"));
if (createHash("sha256").update(JSON.stringify(artifact.reads)).digest("hex") !== artifact.sha256)
  throw Error("reviewed observation digest");
const read = artifact.reads[0],
  schema = closedDecisionSchema({
    actionKinds: ["game.building.queue"],
    actionSchemas: [actionSchema("game.building.queue")],
    reads: [read],
    selectedReadNames: [read.name],
    memory: true,
  });
const forecast = {
  throughGameTimeMs: 3600000,
  assumption: "Conditional current production and signed deliveries",
  expected: {
    iron: { ordinaryUnits: "180000", foundingAllowanceUnits: "6000" },
    grain: { ordinaryUnits: "12000", foundingAllowanceUnits: "0" },
    silver: { ordinaryUnits: "30000", foundingAllowanceUnits: "0" },
  },
  harvestPercentByMinute: Array(60).fill(100),
  assumedDeliveries: [],
};
it("prioritizes usable requested forecast over unrelated fields regardless of object insertion order", () => {
  for (const result of [
    { balances: { large: "x".repeat(9000) }, profile: { large: "x".repeat(5000) }, forecast },
    { forecast, profile: { large: "x".repeat(5000) }, balances: { large: "x".repeat(9000) } },
  ]) {
    const entry = { tool: "pact_world_read_v1", args: { forecastMinutes: 60 }, result };
    expect(object(projectRead(entry, 2000).result).forecast).toEqual(forecast);
    const messages = fitMessages(
      {
        environment: { profile: { kingdomId: "self" }, balances: { iron: "1000" } },
        requestedRead: entry,
        privateNotes: "old authored note ".repeat(1500),
      },
      "Choose freely",
      schema,
      24000,
      boundedReads,
      narrowRead,
      compactEnvironment,
    );
    expect(object(object(JSON.parse(messages[1].content).requestedRead).result).forecast).toEqual(forecast);
    expect(Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(schema))).toBeLessThanOrEqual(
      24000,
    );
  }
});
it("fits a size-matched 24,238-byte cognition reconstruction through a deliverable projection at the unchanged cap", () => {
  const current = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "observation",
    at: "2026-10-15T00:00:00Z",
    detail: { asOfGameTimeMs: 1000 },
  };
  const cognition = {
    version: 0,
    nativeAnalysis: true,
    currentEvidenceId: current.id,
    evidence: [current],
    beliefs: [],
    reflections: [],
    knownPeerIds: [],
  };
  const native = bindGenerationSchema(analysisSchemaForVersion(0, cognition), schema);
  const context: Data = {
    environment: { profile: { kingdomId: "self" }, balances: { iron: "1000" } },
    cognition,
    requestedRead: {
      tool: read.name,
      args: { section: "forecast" },
      result: { section: "forecast", forecast, coverage: { complete: true } },
    },
    privateNotes: "",
  };
  const serialized = () =>
    Buffer.byteLength(
      JSON.stringify([
        { role: "system", content: "Choose freely" },
        {
          role: "user",
          content: JSON.stringify({ ...context, cognition: { ...cognition, analysisOpportunities: [] } }),
        },
      ]),
    ) + Buffer.byteLength(JSON.stringify(native));
  context.privateNotes = "x".repeat(24238 - serialized());
  expect(serialized()).toBe(24238);
  const messages = fitMessages(context, "Choose freely", native, 24000, boundedReads, narrowRead, compactEnvironment),
    delivered = JSON.parse(messages[1].content);
  expect(Buffer.byteLength(JSON.stringify(messages)) + Buffer.byteLength(JSON.stringify(native))).toBeLessThanOrEqual(
    24000,
  );
  expect(delivered.requestedRead.result.forecast).toEqual(forecast);
  expect(delivered.cognition.evidence[0].id).toBe(current.id);
  expect(String(context.privateNotes).length).toBeGreaterThan(0);
});
it("defers an unfit provisional pair before acceptance but never drops an already accepted pair", () => {
  const current = {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "observation",
    at: "2026-10-15T00:00:00Z",
    detail: { asOfGameTimeMs: 1000 },
  };
  const history = ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"].map((id) => ({
    id,
    kind: "interpretation",
    at: current.at,
    detail: { prose: "x".repeat(14000), source: "authored_history" },
  }));
  const context = {
    environment: { profile: { kingdomId: "self" } },
    cognition: {
      version: 0,
      nativeAnalysis: true,
      currentEvidenceId: current.id,
      evidence: [current, ...history],
      beliefs: [],
      reflections: [],
      knownPeerIds: [],
      recall: {
        route: "laya-recall-v1",
        admission: "provisional",
        candidateIds: history.map((e) => e.id),
        selectedId: history[0].id,
      },
    },
  };
  const delivered = JSON.parse(
    fitMessages(context, "Choose freely", schema, 24000, boundedReads, narrowRead, compactEnvironment)[1].content,
  ).cognition;
  expect(delivered.recall).toMatchObject({
    route: "relevance-recency-importance",
    assist: "deferred",
    code: "LAYA_PAIR_NOT_DELIVERABLE",
  });
  expect(context.cognition.evidence).toHaveLength(3);
  expect(() =>
    fitMessages(
      {
        ...context,
        cognition: { ...context.cognition, recall: { ...context.cognition.recall, admission: "accepted" } },
      },
      "Choose freely",
      schema,
      24000,
      boundedReads,
      narrowRead,
      compactEnvironment,
    ),
  ).toThrow("CONTEXT_LIMIT");
});
