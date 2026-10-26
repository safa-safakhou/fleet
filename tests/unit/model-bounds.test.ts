import { expect, it } from "vitest";
import { modelCallBound, modelTurnBound } from "../../src/model-bounds.js";

it("retains normal limits and gives explicit thinking bounded extra time", () => {
  const model = { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b" };
  expect(modelCallBound(model)).toBe(90000);
  expect(modelTurnBound({ ...model, thinking: false })).toBe(120000);
  expect(modelCallBound({ ...model, thinking: true })).toBe(180000);
  expect(modelTurnBound({ ...model, thinking: true })).toBe(360000);
});
