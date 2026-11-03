import { expect, it } from "vitest";
import { ModelConfig } from "../../src/domain.js";
import {
  assertModelCallEnvelope,
  modelAdmissionDeadline,
  modelCallBound,
  modelTurnBound,
} from "../../src/model-bounds.js";

it("keeps historical ceilings and admits an explicitly shorter declared call with its full headroom", () => {
  const base = { route: "openai-compatible", provider: "vllm", model: "synthetic", thinking: false } as const;
  const parsed = ModelConfig.safeParse({ ...base, callTimeoutMs: 35000 });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw Error("DECLARED_BOUND_REJECTED");
  expect(modelCallBound(parsed.data)).toBe(35000);
  expect(modelTurnBound(parsed.data)).toBe(120000);
  expect(modelAdmissionDeadline(parsed.data, new Date(120000))).toBe(84000);
  expect(3 * (modelCallBound(parsed.data) + 1000)).toBeLessThanOrEqual(modelTurnBound(parsed.data));
  expect(modelCallBound(base)).toBe(90000);
});
it("rejects nonintegral, unbounded or ceiling-expanding HTTP deadlines and unsupported CLI overrides", () => {
  const base = { route: "openai-compatible", provider: "vllm", model: "synthetic", thinking: false };
  for (const callTimeoutMs of [0, 999, 35000.5, 90001, Infinity])
    expect(ModelConfig.safeParse({ ...base, callTimeoutMs }).success).toBe(false);
  expect(ModelConfig.safeParse({ route: "codex-cli", model: "synthetic", callTimeoutMs: 35000 }).success).toBe(false);
});

it("refuses a declared multi-call envelope that cannot fit its unchanged turn", () => {
  const model = ModelConfig.parse({
    route: "openai-compatible",
    provider: "vllm",
    model: "synthetic",
    callTimeoutMs: 35000,
  });
  expect(() => assertModelCallEnvelope(model, { maxCallsPerTurn: 3 })).not.toThrow();
  expect(() => assertModelCallEnvelope({ ...model, callTimeoutMs: 45000 }, { maxCallsPerTurn: 3 })).toThrow(
    "MODEL_WORKFLOW_TIME_INFEASIBLE",
  );
});
