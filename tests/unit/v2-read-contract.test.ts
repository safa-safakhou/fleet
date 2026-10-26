import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { pactReadQuerySchema } from "../../src/games/pact/read-queries.js";
import { prepareVllmGenerationSchema } from "../../src/model-schema.js";
import { NegotiationDecisionStep } from "../../src/modules/continuity/v2/decision.js";
import { reactiveProbe } from "../reactive-probe-context.js";
import { decisionProbe } from "../scoped-probe.js";

it("v2 binds the authenticated read contract instead of accepting an observation envelope as a query", async () => {
  let calls = 0;
  const ctx = decisionProbe(
    reactiveProbe(async (_claim, input) => {
      calls++;
      for (const schema of [input.schema, prepareVllmGenerationSchema(input.schema)]) {
        const validate = new Ajv({ strict: false, validateFormats: false }).compile(schema);
        const read = (query: unknown) => ({ decision: { kind: "read", query, summary: "Inspect current facts" } });
        expect(validate(read({ tool: "pact_world_read_v1", args: {} }))).toBe(true);
        expect(validate(read({ readSchema: "pact_world_read_v1" }))).toBe(true);
        expect(validate(read({}))).toBe(true);
        expect(validate(read({ schemaId: "pact.observation.v1", query: {}, summary: "nested" }))).toBe(false);
        expect(validate(read({ tool: "invented", args: {} }))).toBe(false);
        expect(validate(read({ tool: "game.building.queue", args: {} }))).toBe(false);
      }
      return {
        decision: { decision: { kind: "wait", summary: "Synthetic check complete" } },
        inputTokens: 1,
        outputTokens: 1,
      };
    }),
  );
  ctx.readQuerySchema = async () => pactReadQuerySchema(["pact_world_read_v1"], false);
  ctx.state = { load: async () => null, accept: async () => ({ accepted: true, version: 1 }) } as never;
  ctx.evidence = { retained: async () => [] } as never;
  await new NegotiationDecisionStep().runContext(ctx);
  expect(calls).toBe(1);
});
