import { Ajv } from "ajv";
import { expect, it } from "vitest";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import { reactiveProbe } from "../reactive-probe-context.js";

it("constrains action schema IDs to the current environment before admission", async () => {
  await new ReactiveEngine().run(
    reactiveProbe(async (_claim, input) => {
      const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
      expect(check({ kind: "action", schemaId: "invented", payload: {}, summary: "Act" })).toBe(false);
      expect(check({ kind: "action", schemaId: "board.move.v1", payload: {}, summary: "Act" })).toBe(true);
      expect(check({ kind: "wait", summary: "Wait" })).toBe(true);
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 10, outputTokens: 2 };
    }),
  );
});

it("retains wait/read decisions in an environment with no action schemas", async () => {
  const ctx = reactiveProbe(async (_claim, input) => {
    const check = new Ajv({ strict: false, validateFormats: false }).compile(input.schema);
    expect(check({ kind: "wait", summary: "Wait" })).toBe(true);
    expect(check({ kind: "action", schemaId: "invented", payload: {}, summary: "Act" })).toBe(false);
    return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 10, outputTokens: 2 };
  });
  ctx.schemas = { actions: [], observations: ["board.position.v1"] };
  await new ReactiveEngine().run(ctx);
});
