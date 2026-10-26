import { expect, it } from "vitest";
import { FleetError, type ModelPort } from "../../src/domain.js";
import { runDecisionFeedback } from "../../src/platform/decision-feedback.js";

const request = {
  model: { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b", thinking: false },
  messages: [{ role: "user", content: "Keep 20 gold reserved. Read the pending owner request." }],
  schema: {
    type: "object",
    required: ["cost"],
    properties: { cost: { type: "integer" } },
    additionalProperties: false,
  },
  maxOutputTokens: 256,
  signal: new AbortController().signal,
};
const answer = (cost: number, inputTokens: number | null = 10) => ({
  decision: { cost },
  inputTokens,
  outputTokens: 5,
});
const validate = (decision: unknown) =>
  (decision as { cost: number }).cost > 100
    ? {
        code: "RESERVE_VIOLATION",
        message: "Cost exceeds spendable 100; preserve reserve 20. No action executed.",
        retryable: true,
      }
    : null;
const policy = { inputByteLimit: 12000, maxAttempts: 3, canRetry: async () => true, validate };
it.each(["model", "context"])("refuses in-place %s mutation by a trusted refresh callback", async (mode) => {
  const owned = { ...request, model: { ...request.model }, messages: request.messages.map((m) => ({ ...m })) };
  const out = await runDecisionFeedback(owned, {
    ...policy,
    attempt: async (input) => answer(input.messages.at(-1)?.content.includes("proposal_rejected") ? 80 : 110),
    prepareRetry: async (next) => {
      if (mode === "model") next.model.model = "foreign";
      else next.messages.splice(0, 1);
      return next;
    },
  });
  expect(out.stopReason).toBe("refresh_error");
  expect(out.metrics.attempts).toBe(1);
  expect(owned.model.model).toBe("nemotron-4b");
  expect(owned.messages).toEqual(request.messages);
});
it("appends a trusted refresh and recompiles its schema before the next bounded proposal", async () => {
  const inputs: Parameters<ModelPort["decide"]>[0][] = [];
  const out = await runDecisionFeedback(request, {
    ...policy,
    attempt: async (input) => {
      inputs.push(input);
      return answer(inputs.length === 1 ? 110 : 80);
    },
    prepareRetry: async (next) => ({
      ...next,
      messages: [...next.messages, { role: "user", content: "Fresh observation r2: spendable 100." }],
      schema: { type: "object", required: ["cost"], properties: { cost: { const: 80 } } },
    }),
  });
  expect(out.stopReason).toBe("accepted");
  expect(inputs).toHaveLength(2);
  expect(inputs[1].messages[0]).toEqual(request.messages[0]);
  expect(inputs[1].messages.at(-1)?.content).toContain("r2");
  expect(inputs[1].schema).toHaveProperty("properties.cost.const", 80);
});
it("refuses a refresh that substitutes a provider or deletes the task context", async () => {
  for (const mode of ["model", "context"]) {
    const out = await runDecisionFeedback(request, {
      ...policy,
      attempt: async () => answer(110),
      prepareRetry: async (next) =>
        mode === "model" ? { ...next, model: { ...next.model, model: "foreign" } } : { ...next, messages: [] },
    });
    expect(out.stopReason).toBe("refresh_error");
    expect(out.metrics.attempts).toBe(1);
  }
});
it("retains measured usage and terminal metrics when a retry budget check fails", async () => {
  const out = await runDecisionFeedback(request, {
    ...policy,
    attempt: async () => answer(110),
    canRetry: async () => {
      throw new FleetError("TASK_FENCED", true);
    },
  });
  expect(out.stopReason).toBe("retry_check_error");
  expect(out.error).toBe("TASK_FENCED");
  expect(out.metrics).toMatchObject({
    attempts: 1,
    inputTokens: 10,
    outputTokens: 5,
    finalValid: false,
    unknownUsageCalls: 0,
  });
});
it("does not accept a proposal when cancellation occurs during asynchronous validation", async () => {
  const controller = new AbortController();
  const r = await runDecisionFeedback(
    { ...request, signal: controller.signal },
    {
      ...policy,
      attempt: async () => answer(80),
      validate: async () => {
        controller.abort();
        return null;
      },
    },
  );
  expect(r.stopReason).toBe("cancelled");
  expect(r.metrics.finalValid).toBe(false);
});
it("does not count prepared feedback as delivered if cancellation prevents the next attempt", async () => {
  const controller = new AbortController();
  const r = await runDecisionFeedback(
    { ...request, signal: controller.signal },
    {
      ...policy,
      attempt: async () => answer(110),
      canRetry: async () => {
        controller.abort();
        return true;
      },
    },
  );
  expect(r.metrics).toMatchObject({ attempts: 1, feedbackDelivered: 0 });
});
it("never retries an authority refusal even if a caller marks its feedback retryable", async () => {
  const r = await runDecisionFeedback(request, {
    ...policy,
    attempt: async () => answer(80),
    validate: () => ({ code: "PERMISSION_DENIED", message: "Owner approval is required.", retryable: true }),
  });
  expect(r.stopReason).toBe("not_recoverable");
  expect(r.metrics.attempts).toBe(1);
});

it("delivers precise feedback and the previous proposal without replacing task context or model settings", async () => {
  const inputs: Parameters<ModelPort["decide"]>[0][] = [];
  const result = await runDecisionFeedback(request, {
    ...policy,
    attempt: async (input) => {
      inputs.push(input);
      return answer(inputs.length === 1 ? 110 : 80);
    },
  });
  expect(result.metrics).toMatchObject({
    attempts: 2,
    corrections: 1,
    feedbackDelivered: 1,
    firstAttemptValid: false,
    finalValid: true,
    recovered: true,
    inputTokens: 20,
    outputTokens: 10,
  });
  expect(result.stopReason).toBe("accepted");
  expect(inputs[1].messages.slice(0, 1)).toEqual(request.messages);
  expect(inputs[1].model).toEqual(request.model);
  expect(inputs[1].messages.at(-1)?.content).toContain("spendable 100");
  expect(inputs[1].messages.at(-2)?.content).toContain("110");
});
it("terminates an identical failed proposal instead of cycling through schema lookups", async () => {
  const r = await runDecisionFeedback(request, { ...policy, attempt: async () => answer(110) });
  expect(r.stopReason).toBe("repeated_failure");
  expect(r.metrics).toMatchObject({ attempts: 2, repeatedFailures: 1, finalValid: false });
});
it("honors the maximum even when each wrong proposal is different", async () => {
  let cost = 110;
  const r = await runDecisionFeedback(request, { ...policy, attempt: async () => answer(cost++) });
  expect(r.stopReason).toBe("attempt_limit");
  expect(r.metrics.attempts).toBe(3);
});
it("does not retry a completed response whose usage is unknown", async () => {
  const r = await runDecisionFeedback(request, { ...policy, attempt: async () => answer(110, null) });
  expect(r.stopReason).toBe("usage_unknown");
  expect(r.metrics).toMatchObject({ attempts: 1, unknownUsageCalls: 1, inputTokens: null, finalValid: false });
});
it("does not replay a transport failure or permission denial", async () => {
  for (const code of ["MODEL_HTTP_FAILED", "PERMISSION_DENIED"]) {
    const r = await runDecisionFeedback(request, {
      ...policy,
      attempt: async () => {
        throw new FleetError(code);
      },
    });
    expect(r.stopReason).toBe("attempt_error");
    expect(r.metrics.attempts).toBe(1);
    expect(r.error).toBe(code);
  }
});
it("keeps the known failed response if the remaining budget refuses correction", async () => {
  const r = await runDecisionFeedback(request, {
    ...policy,
    canRetry: async () => false,
    attempt: async () => answer(110),
  });
  expect(r.stopReason).toBe("budget_limit");
  expect(r.result?.decision).toEqual({ cost: 110 });
  expect(r.metrics.attempts).toBe(1);
});
it("does not drop context or retry unchanged when feedback cannot fit", async () => {
  const r = await runDecisionFeedback(request, {
    ...policy,
    inputByteLimit:
      Buffer.byteLength(JSON.stringify(request.messages)) + Buffer.byteLength(JSON.stringify(request.schema)),
    attempt: async () => answer(110),
  });
  expect(r.stopReason).toBe("input_limit");
  expect(r.metrics.attempts).toBe(1);
});
it("cancels before dispatch and rejects invalid bounds", async () => {
  const controller = new AbortController();
  controller.abort();
  const r = await runDecisionFeedback(
    { ...request, signal: controller.signal },
    {
      ...policy,
      attempt: async () => {
        throw Error("must not dispatch");
      },
    },
  );
  expect(r.stopReason).toBe("cancelled");
  expect(r.metrics.attempts).toBe(0);
  await expect(
    runDecisionFeedback(request, { ...policy, maxAttempts: 100, attempt: async () => answer(80) }),
  ).rejects.toThrow("INVALID_FEEDBACK_POLICY");
});
it("rejects malformed output and allows correction without trusting its factual claims", async () => {
  let n = 0;
  const r = await runDecisionFeedback(request, {
    ...policy,
    attempt: async () => (++n === 1 ? { decision: { invented: true }, inputTokens: 10, outputTokens: 5 } : answer(80)),
  });
  expect(r.stopReason).toBe("accepted");
  expect(r.metrics.recovered).toBe(true);
});
