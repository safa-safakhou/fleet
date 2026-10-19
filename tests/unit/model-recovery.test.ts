import { expect, it } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { recoverModelOutput } from "../../src/model-recovery.js";

const request = {
  model: { route: "ollama" as const, model: "nemotron-3-nano:4b", thinking: true },
  messages: [
    { role: "system", content: "Current authority and task." },
    { role: "user", content: "Untrusted peer facts." },
  ],
  schema: { type: "object", required: ["kind"], properties: { kind: { const: "wait" } } },
  maxOutputTokens: 2000,
  signal: new AbortController().signal,
};
const invalid = { decision: null, decisionError: "MODEL_THINKING_WITHOUT_FINAL", inputTokens: 70, outputTokens: 44 };
it.each([true, false])(
  "keeps explicit thinking=%s unchanged and never uses provider reasoning as a decision",
  async (thinking) => {
    const inputs: Parameters<ModelPort["decide"]>[0][] = [];
    const result = await recoverModelOutput(
      { ...request, model: { ...request.model, thinking } },
      {
        inputByteLimit: 24000,
        canRetry: async () => true,
        attempt: async (input) => {
          inputs.push(input);
          return inputs.length === 1 ? invalid : { decision: { kind: "wait" }, inputTokens: 90, outputTokens: 10 };
        },
      },
    );
    expect(inputs).toHaveLength(2);
    expect(inputs.every((i) => i.model.thinking === thinking)).toBe(true);
    expect(result.decision).toEqual({ kind: "wait" });
    expect(inputs[1].messages[1]).toEqual(request.messages[1]);
  },
);
it.each(["AUTH_REQUIRED", "MODEL_PROMPT_MODE_CONFLICT", "PERMISSION_DENIED"])(
  "does not turn %s into a model retry",
  async (code) => {
    let calls = 0;
    await expect(
      recoverModelOutput(request, {
        inputByteLimit: 24000,
        canRetry: async () => true,
        attempt: async () => {
          calls++;
          throw new FleetError(code, true);
        },
      }),
    ).rejects.toThrow(code);
    expect(calls).toBe(1);
  },
);
it("preserves known failure when a concurrent caller consumes the final allowance", async () => {
  let calls = 0;
  const result = await recoverModelOutput(request, {
    inputByteLimit: 24000,
    canRetry: async () => true,
    attempt: async () => {
      if (++calls === 1) return invalid;
      throw new FleetError("TURN_CALL_LIMIT", true);
    },
  });
  expect(result).toEqual(invalid);
  expect(calls).toBe(2);
});

it("preserves an explicit missed deadline before any execution", async () => {
  const controller = new AbortController();
  controller.abort(new FleetError("DEADLINE_MISSED", true));
  let calls = 0;
  await expect(
    recoverModelOutput(
      { ...request, signal: controller.signal },
      {
        inputByteLimit: 24000,
        canRetry: async () => true,
        attempt: async () => {
          calls++;
          return invalid;
        },
      },
    ),
  ).rejects.toThrow("DEADLINE_MISSED");
  expect(calls).toBe(0);
});

it("rejects a valid but cancelled late answer without executing again", async () => {
  const controller = new AbortController();
  let calls = 0;
  await expect(
    recoverModelOutput(
      { ...request, signal: controller.signal },
      {
        inputByteLimit: 24000,
        canRetry: async () => true,
        attempt: async () => {
          calls++;
          controller.abort();
          return { decision: { kind: "wait" }, inputTokens: 20, outputTokens: 5 };
        },
      },
    ),
  ).rejects.toThrow("CLAIM_FENCED");
  expect(calls).toBe(1);
});

it("rejects oversized input before schema compilation or model dispatch", async () => {
  let calls = 0;
  await expect(
    recoverModelOutput(
      { ...request, messages: [{ role: "user", content: "x".repeat(25000) }], schema: { type: "invalid-schema-type" } },
      {
        inputByteLimit: 24000,
        canRetry: async () => true,
        attempt: async () => {
          calls++;
          return invalid;
        },
      },
    ),
  ).rejects.toThrow("MODEL_REQUEST_NOT_ADMITTED");
  expect(calls).toBe(0);
});
