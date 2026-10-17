import { expect, it } from "vitest";
import { ReactiveEngine } from "../../src/engines/reactive/engine.js";
import expected from "../fixtures/engines/reactive-basic-v1-input.json" with { type: "json" };
import { reactiveProbe } from "../reactive-probe-context.js";

it("preserves the F4 basic request exactly after adding continuity hooks", async () => {
  let called = 0;
  await new ReactiveEngine().run(
    reactiveProbe(async (_claim, input) => {
      called++;
      expect({ messages: input.messages, schema: input.schema }).toEqual(expected);
      return { decision: { kind: "wait", summary: "Wait" }, inputTokens: 500, outputTokens: 50 };
    }),
  );
  expect(called).toBe(1);
});
