import { expect, it } from "vitest";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import expected from "../fixtures/engines/reactive-basic-v1-input.json" with { type: "json" };
import { reactiveProbe } from "../reactive-probe-context.js";

it("preserves the archived F4 packet except the explicit advertised-ID correction", async () => {
  let called = 0;
  await new ReactiveEngine().run(
    reactiveProbe(async (_claim, input) => {
      called++;
      const corrected = structuredClone(expected);
      corrected.schema.oneOf[2].properties.schemaId = {
        type: "string",
        maxLength: 100,
        enum: ["board.move.v1"],
      } as never;
      expect({ messages: input.messages, schema: input.schema }).toEqual(corrected);
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 500, outputTokens: 50 };
    }),
  );
  expect(called).toBe(1);
});
