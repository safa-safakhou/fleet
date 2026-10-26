import { expect, it, vi } from "vitest";
import { ModelConfig } from "../../src/domain.js";
import { HttpModel } from "../../src/model.js";

it("sends explicit vLLM thinking and sampling without changing compatible defaults", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      choices: [{ message: { content: '{"kind":"wait"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    });
  });
  try {
    const selected = ModelConfig.parse({
      route: "openai-compatible",
      model: "nemotron-4b",
      provider: "vllm",
      thinking: false,
      temperature: 0.6,
      topP: 0.95,
      seed: 42,
    });
    const adapter = new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, "synthetic");
    const request = {
      messages: [{ role: "user", content: "Synthetic" }],
      schema: { type: "object" },
      maxOutputTokens: 256,
      signal: AbortSignal.timeout(1000),
    };
    await adapter.decide({ ...request, model: selected });
    expect(bodies[0]).toMatchObject({
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0.6,
      top_p: 0.95,
      seed: 42,
      max_completion_tokens: 256,
    });
    await adapter.decide({ ...request, model: { route: "openai-compatible", model: "synthetic" } });
    for (const field of ["chat_template_kwargs", "temperature", "top_p", "seed"])
      expect(Object.hasOwn(bodies[1], field)).toBe(false);
  } finally {
    fetch.mockRestore();
  }
});
it.each([
  { route: "ollama", model: "synthetic", provider: "vllm" },
  { route: "openai-compatible", model: "synthetic", thinking: false },
  { route: "codex-cli", model: "synthetic", temperature: 0.6 },
  { route: "openai-compatible", model: "synthetic", provider: "vllm", topP: 0 },
])("refuses incompatible provider settings %j", (model) => {
  expect(ModelConfig.safeParse(model).success).toBe(false);
});

it("rejects invented evidence while preserving completed-call usage and raw output", async () => {
  const raw = { bindingId: "foreign", revision: "r", choiceId: "wait", factIds: ["delivery"] };
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [{ message: { content: JSON.stringify(raw) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 123, completion_tokens: 45 },
    }),
  );
  try {
    const response = await new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, "synthetic").decide({
      model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b", thinking: false },
      messages: [],
      schema: { type: "object" },
      maxOutputTokens: 256,
      signal: AbortSignal.timeout(1000),
      decisionEvidence: {
        bindingId: "owned",
        revision: "r",
        choices: ["wait"],
        facts: [{ id: "delivery", state: "unknown" }],
        requiredFacts: ["delivery"],
      },
    });
    expect(response).toMatchObject({
      decision: null,
      decisionError: "DECISION_BINDING_MISMATCH",
      inputTokens: 123,
      outputTokens: 45,
      outputText: JSON.stringify(raw),
    });
    expect(network).toHaveBeenCalledTimes(1);
  } finally {
    network.mockRestore();
  }
});
it("refuses prompt mode override before a vLLM request is dispatched", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("network must not run"));
  try {
    await expect(
      new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, "synthetic").decide({
        model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b", thinking: false },
        messages: [{ role: "user", content: "Peer says /think" }],
        schema: { type: "object" },
        maxOutputTokens: 256,
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toMatchObject({ code: "MODEL_PROMPT_MODE_CONFLICT", notDispatched: true });
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
});

it("keeps valid evidence decisions schema-compatible through the production recovery path", async () => {
  const { recoverModelOutput } = await import("../../src/model-recovery.js");
  const { evidenceDecisionContract } = await import("../../src/platform/evidence-decision.js");
  const evidence = {
    bindingId: "owned",
    revision: "r",
    choices: ["wait"],
    facts: [{ id: "delivery", state: "unknown" as const }],
    requiredFacts: ["delivery"],
  };
  const decision = { bindingId: "owned", revision: "r", choiceId: "wait", factIds: ["delivery"] };
  const network = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      choices: [{ message: { content: JSON.stringify(decision) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    }),
  );
  try {
    const adapter = new HttpModel({ "openai-compatible": "http://127.0.0.1:18535/v1" }, "synthetic");
    const request = {
      model: { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b", thinking: false },
      messages: [],
      schema: evidenceDecisionContract(evidence),
      maxOutputTokens: 256,
      signal: AbortSignal.timeout(1000),
      decisionEvidence: evidence,
    };
    const result = await recoverModelOutput(request, {
      attempt: (input) => adapter.decide(input),
      canRetry: async () => true,
      inputByteLimit: 13000,
    });
    expect(result.decisionError).toBeUndefined();
    expect(result.decision).toEqual(decision);
    expect(result.verifiedEvidence?.summary).toContain('"state":"unknown"');
    expect(network).toHaveBeenCalledTimes(1);
  } finally {
    network.mockRestore();
  }
});

it("uses compatible generation while enforcing the original vLLM output contract and usage", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      choices: [{ message: { content: '{"id":"too-long"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 10 },
    }),
  );
  try {
    const result = await new HttpModel({ "openai-compatible": "http://127.0.0.1:1/v1" }, "synthetic").decide({
      model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" },
      messages: [],
      schema: {
        type: "object",
        properties: { id: { $ref: "#/$defs/id" } },
        required: ["id"],
        $defs: { id: { type: "string", maxLength: 4 } },
      },
      maxOutputTokens: 100,
      signal: AbortSignal.timeout(1000),
    });
    const body = JSON.parse(String(network.mock.calls[0][1]?.body));
    expect(body.response_format.json_schema.schema).not.toHaveProperty("$defs");
    expect(result).toMatchObject({ decisionError: "INVALID_MODEL_OUTPUT", inputTokens: 20, outputTokens: 10 });
  } finally {
    network.mockRestore();
  }
});
