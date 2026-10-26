import { expect, it } from "vitest";
import { recoverModelOutput } from "../../src/model-recovery.js";
import { runDecisionFeedback } from "../../src/platform/decision-feedback.js";

it.each(["feedback", "recovery"])(
  "enforces independent native contracts in shared %s without losing completed usage",
  async (kind) => {
    let calls = 0;
    const request = {
      model: { route: "ollama" as const, model: "synthetic" },
      messages: [],
      schema: { type: "object" },
      outputContract: { type: "object", properties: { ref: { type: "string", maxLength: 4 } }, required: ["ref"] },
      maxOutputTokens: 100,
      signal: new AbortController().signal,
    };
    const policy = {
      inputByteLimit: 10000,
      canRetry: async () => true,
      attempt: async () => ({
        decision: { ref: ++calls === 1 ? "wrong-reference" : "okay" },
        inputTokens: 5,
        outputTokens: 2,
      }),
    };
    const result =
      kind === "feedback"
        ? (await runDecisionFeedback(request, { ...policy, maxAttempts: 3, validate: () => null })).result
        : await recoverModelOutput(request, policy);
    expect(calls).toBe(2);
    expect(result).toMatchObject({ decision: { ref: "okay" }, inputTokens: 5, outputTokens: 2 });
  },
);
