import { expect, it } from "vitest";
import type { ModelPort } from "../../src/domain.js";
import type { Observation } from "../../src/platform/contracts.js";
import { runDecisionFeedback } from "../../src/platform/decision-feedback.js";
import { type DecisionGrounding, executeGroundedDecision } from "../../src/platform/native-grounding.js";

const observation = (revision: string): Observation => ({
  schemaId: "fixture",
  revision,
  observedAt: "2026-10-24",
  environmentTime: { clockId: "fixture", value: revision },
  sourceRefs: [revision],
  payload: {},
  coverage: {},
});
const request = {
  model: { route: "ollama" as const, model: "fake-model" },
  messages: [{ role: "user", content: "Keep original context" }],
  schema: { type: "object", properties: { revision: { type: "string" } }, required: ["revision"] },
  maxOutputTokens: 100,
  signal: new AbortController().signal,
};
it("refreshes observation-bound values while retaining the independent native envelope", async () => {
  const requests: Parameters<ModelPort["decide"]>[0][] = [];
  const native = {
    ...request,
    schema: { type: "object", properties: { revision: { const: "1" } }, required: ["revision"] },
    outputContract: request.schema,
  };
  const out = await executeGroundedDecision(
    native,
    observation("1"),
    {
      prepare: (input, view) => ({
        ...input,
        schema: { ...input.schema, properties: { revision: { const: view.revision } } },
      }),
      validate: (raw) =>
        (raw as { revision: string }).revision === "1"
          ? { code: "STALE_OBSERVATION", message: "Use the fresh view", retryable: true }
          : null,
      refreshQuery: () => ({}),
    },
    {
      run: (r, p) =>
        runDecisionFeedback(r, {
          ...p,
          inputByteLimit: 10000,
          canRetry: async () => true,
          attempt: async (r) => {
            requests.push(r);
            return { decision: { revision: requests.length === 1 ? "1" : "2" }, inputTokens: 5, outputTokens: 2 };
          },
        }),
      observe: async () => observation("2"),
    },
  );
  expect(requests).toHaveLength(2);
  expect(out.stopReason).toBe("accepted");
  expect(out.result?.decision).toEqual({ revision: "2" });
});
it("corrects an optional field that a prepared schema wrongly widens before semantic acceptance", async () => {
  let calls = 0;
  const native = {
    ...request,
    schema: { type: "object", properties: { ref: { type: "string", maxLength: 4 } }, required: ["ref"] },
  };
  const out = await executeGroundedDecision(
    native,
    observation("1"),
    {
      prepare: (input) => ({ ...input, schema: { type: "object" } }),
      validate: () => null,
    },
    {
      run: (r, p) =>
        runDecisionFeedback(r, {
          ...p,
          inputByteLimit: 10000,
          canRetry: async () => true,
          attempt: async () => ({
            decision: { ref: ++calls === 1 ? "wrong-reference" : "okay" },
            inputTokens: 5,
            outputTokens: 2,
          }),
        }),
      observe: async () => observation("1"),
    },
  );
  expect(calls).toBe(2);
  expect(out.result?.decision).toEqual({ ref: "okay" });
  expect(out.metrics.errors).toEqual(["INVALID_MODEL_OUTPUT"]);
});
it("refreshes through the host, preserves context and settles every bounded attempt", async () => {
  const calls: Parameters<ModelPort["decide"]>[0][] = [];
  let reads = 0;
  const port: DecisionGrounding = {
    prepare: (input, view) => ({
      ...input,
      messages: [...input.messages, { role: "user", content: `Current revision ${view.revision}` }],
    }),
    validate: (raw, view) =>
      (raw as { revision: string }).revision === view.revision
        ? null
        : { code: "STALE_OBSERVATION", message: "Refresh before correcting", retryable: true },
    refreshQuery: (feedback) => (feedback.code === "STALE_OBSERVATION" ? {} : undefined),
  };
  const out = await executeGroundedDecision(request, observation("1"), port, {
    run: (r, p) =>
      runDecisionFeedback(r, {
        ...p,
        inputByteLimit: 10000,
        canRetry: async () => true,
        attempt: async (r) => {
          calls.push(r);
          return {
            decision: { revision: calls.length === 1 ? "0" : "2" },
            inputTokens: 10,
            outputTokens: 4,
            allocationId: `call:${calls.length}`,
          };
        },
      }),
    observe: async () => {
      reads++;
      return observation("2");
    },
  });
  expect(out.stopReason).toBe("accepted");
  expect(out.observation.revision).toBe("2");
  expect(reads).toBe(1);
  expect(calls).toHaveLength(2);
  expect(calls[1].messages[0]).toEqual(request.messages[0]);
  expect(calls[1].messages.some((m) => m.content.includes("STALE_OBSERVATION"))).toBe(true);
  expect(out.metrics.recovered).toBe(true);
  expect(out.result).toHaveProperty("allocationId", "call:2");
});
it("does not refresh or retry uncertain usage", async () => {
  let reads = 0;
  let calls = 0;
  const port: DecisionGrounding = {
    prepare: (input) => input,
    validate: () => ({ code: "STALE_OBSERVATION", message: "Refresh", retryable: true }),
    refreshQuery: () => ({}),
  };
  const out = await executeGroundedDecision(request, observation("1"), port, {
    run: (r, p) =>
      runDecisionFeedback(r, {
        ...p,
        inputByteLimit: 10000,
        canRetry: async () => true,
        attempt: async () => {
          calls++;
          return { decision: { revision: "0" }, inputTokens: null, outputTokens: null };
        },
      }),
    observe: async () => {
      reads++;
      return observation("2");
    },
  });
  expect(out.stopReason).toBe("usage_unknown");
  expect(calls).toBe(1);
  expect(reads).toBe(0);
});
