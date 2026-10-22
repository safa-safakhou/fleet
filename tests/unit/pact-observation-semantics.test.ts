import { expect, it } from "vitest";
import { createPactEnvironment } from "../../src/environments/pact.js";

it("provides native quantity meanings without claiming stock or allowance satisfies an external supply flow", () => {
  const adapter = createPactEnvironment({} as never),
    text = adapter.observationSemantics;
  expect(text).toBeTypeOf("string");
  expect(text).toMatch(/amounts.*rates.*different/i);
  for (const value of [
    "stock",
    "founding allowance",
    "own production",
    "quotes",
    "signatures",
    "actual external delivery",
    "GAME window",
  ])
    expect(text?.toLowerCase()).toContain(value.toLowerCase());
  expect(text?.length).toBeLessThan(300);
});
