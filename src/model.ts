import { FleetError, type ModelPort, object } from "./domain.js";
import { jsonRequest } from "./http.js";
import { compileGenerationSchema, prepareVllmGenerationSchema } from "./model-schema.js";
import { assertCacheSelection, type CacheProfile, cacheResource, parseCacheProfile } from "./platform/cache-profile.js";
import { evidenceDecisionContract, validateEvidenceDecision } from "./platform/evidence-decision.js";
import { vllmCompletion } from "./vllm-transport.js";
export class HttpModel implements ModelPort {
  readonly tracksDispatch = true;
  private windows = new Map<string, number>();
  contextWindow(model: import("./domain.js").ModelSettings) {
    if (model.route === "ollama") return this.ollamaOptions.contextLength;
    if (model.provider === "vllm" && this.cacheProfile?.model === model.model) return this.cacheProfile.contextLength;
    return this.windows.get(`${model.route}:${model.model}`);
  }
  constructor(
    private routes: { ollama?: string; "openai-compatible"?: string },
    private apiKey: string | undefined,
    private ollamaOptions: { contextLength: number; keepAliveSeconds: number } = {
      contextLength: 32768,
      keepAliveSeconds: 0,
    },
    private cacheProfile?: CacheProfile,
  ) {}
  async estimateInputTokens(input: {
    model: import("./domain.js").ModelSettings;
    messages: { role: string; content: string }[];
    maxOutputTokens?: number;
    signal: AbortSignal;
  }) {
    if (input.model.provider !== "vllm" || !this.routes["openai-compatible"] || !this.apiKey)
      throw new FleetError("PROVIDER_TOKENIZER_REQUIRED", true);
    try {
      const { data } = await jsonRequest(
        `${this.routes["openai-compatible"].replace(/\/v1\/?$/, "")}/tokenize`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: input.model.model,
            messages: input.messages,
            add_generation_prompt: true,
            ...(input.model.thinking !== undefined
              ? { chat_template_kwargs: { enable_thinking: input.model.thinking } }
              : {}),
          }),
        },
        input.signal,
      );
      if (!Number.isSafeInteger(data.count) || Number(data.count) < 1) throw new Error("bad token count");
      if (!Number.isSafeInteger(data.max_model_len) || Number(data.max_model_len) < 1)
        throw new Error("bad context capacity");
      if (Number(data.count) + (input.maxOutputTokens ?? 0) > Number(data.max_model_len))
        throw new FleetError("PROVIDER_CONTEXT_CAPACITY", true);
      this.windows.set(`${input.model.route}:${input.model.model}`, Number(data.max_model_len));
      return Number(data.count);
    } catch (error) {
      if (error instanceof FleetError && error.notDispatched) throw error;
      throw new FleetError("PROVIDER_TOKENIZER_UNAVAILABLE", true);
    }
  }
  async decide(input: Parameters<ModelPort["decide"]>[0]) {
    if (this.cacheProfile && (input.model.route === "openai-compatible" || input.model.provider === "vllm")) {
      assertCacheSelection(this.cacheProfile, input.model, this.routes["openai-compatible"]);
      if (!this.apiKey) throw new FleetError("MODEL_CREDENTIAL_REQUIRED", true);
      try {
        const { data } = await jsonRequest(
          `${this.cacheProfile.endpoint.replace(/\/v1\/?$/, "")}/fleet/cache-profile`,
          { headers: { authorization: `Bearer ${this.apiKey}` } },
          input.signal,
        );
        if (cacheResource(parseCacheProfile(data)).fingerprint !== cacheResource(this.cacheProfile).fingerprint)
          throw new FleetError("PROVIDER_CACHE_PROFILE_MISMATCH", true);
      } catch (error) {
        if (error instanceof FleetError && error.notDispatched) throw error;
        throw new FleetError("PROVIDER_CACHE_PROFILE_UNAVAILABLE", true);
      }
    }
    const validate = compileGenerationSchema(input.schema);
    const nativeContract = input.outputContract ? compileGenerationSchema(input.outputContract) : undefined;
    const generationSchema = input.model.provider === "vllm" ? prepareVllmGenerationSchema(input.schema) : input.schema;
    if (input.decisionEvidence) evidenceDecisionContract(input.decisionEvidence);
    if (input.model.route === "codex-cli") throw new FleetError("CODEX_CONFIGURATION_REQUIRED", true);
    const base = this.routes[input.model.route];
    if (!base) throw new FleetError("MODEL_ENDPOINT_REQUIRED", true);
    const ollama = input.model.route === "ollama";
    if (!ollama && !this.apiKey) throw new FleetError("MODEL_CREDENTIAL_REQUIRED", true);
    // Nemotron's renderer reads inline mode toggles even from untrusted message data.
    // Refuse the conflict rather than silently changing the caller's explicit mode.
    if (
      ((ollama && input.model.model.split(":")[0] === "nemotron-3-nano") ||
        (input.model.provider === "vllm" && /nemotron/i.test(input.model.model))) &&
      input.model.thinking !== undefined &&
      input.messages.some((m) => {
        const text = m.content.replaceAll("</think>", "");
        return (m.role === "user" || m.role === "system") && (text.includes("/think") || text.includes("/no_think"));
      })
    )
      throw new FleetError("MODEL_PROMPT_MODE_CONFLICT", true);
    const body = ollama
      ? {
          model: input.model.model,
          messages: input.messages,
          stream: false,
          format: input.schema,
          keep_alive: this.ollamaOptions.keepAliveSeconds,
          ...(input.model.thinking !== undefined ? { think: input.model.thinking } : {}),
          options: {
            num_predict: input.maxOutputTokens,
            num_ctx: this.ollamaOptions.contextLength,
            ...(input.model.temperature !== undefined ? { temperature: input.model.temperature } : {}),
            ...(input.model.topP !== undefined ? { top_p: input.model.topP } : {}),
            ...(input.model.seed !== undefined ? { seed: input.model.seed } : {}),
          },
        }
      : {
          model: input.model.model,
          messages: input.messages,
          stream: false,
          max_completion_tokens: input.maxOutputTokens,
          ...(input.model.provider === "vllm" && input.model.thinking !== undefined
            ? { chat_template_kwargs: { enable_thinking: input.model.thinking } }
            : {}),
          ...(input.model.temperature !== undefined ? { temperature: input.model.temperature } : {}),
          ...(input.model.topP !== undefined ? { top_p: input.model.topP } : {}),
          ...(input.model.seed !== undefined ? { seed: input.model.seed } : {}),
          response_format: {
            type: "json_schema",
            json_schema: { name: "fleet_decision", strict: false, schema: generationSchema },
          },
        };
    await input.onDispatch?.();
    const response =
      input.model.provider === "vllm"
        ? await vllmCompletion(`${base}/chat/completions`, body, this.apiKey ?? "", input.signal)
        : await jsonRequest(
            `${base}${ollama ? "/api/chat" : "/chat/completions"}`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                ...(!ollama ? { authorization: `Bearer ${this.apiKey}` } : {}),
              },
              body: JSON.stringify(body),
            },
            input.signal,
          );
    const { data } = response;
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const message = ollama ? object(data.message) : object(object(choices[0]).message);
    const usage = object(data.usage),
      i = ollama ? data.prompt_eval_count : usage.prompt_tokens,
      o = ollama ? data.eval_count : usage.completion_tokens;
    const providerMetadata = ollama
      ? {
          protocol: "ollama.chat" as const,
          done: typeof data.done === "boolean" ? data.done : null,
          doneReason: ["stop", "length", "load", "unload"].includes(String(data.done_reason))
            ? String(data.done_reason)
            : null,
          contentChars: typeof message.content === "string" ? message.content.length : 0,
          thinkingChars: typeof message.thinking === "string" ? message.thinking.length : 0,
          toolCallCount: Array.isArray(message.tool_calls) ? message.tool_calls.length : 0,
        }
      : undefined;
    // Usage belongs to the completed execution, even when its answer is unusable.
    let decision: unknown = null;
    let decisionError: string | undefined;
    let verifiedEvidence: ReturnType<typeof validateEvidenceDecision> | undefined;
    try {
      if (typeof message.content !== "string") throw new Error("missing content");
      decision = JSON.parse(message.content);
    } catch {
      decisionError =
        data.done_reason === "length" || object(choices[0]).finish_reason === "length"
          ? "MODEL_OUTPUT_TRUNCATED"
          : ollama &&
              (typeof message.content !== "string" || !message.content.trim()) &&
              providerMetadata?.thinkingChars
            ? "MODEL_THINKING_WITHOUT_FINAL"
            : "INVALID_MODEL_OUTPUT";
    }
    // Preserve the engine's specific evidence errors for correction feedback.
    // A successfully verified answer must still pass the generation contract below.
    if (!decisionError && input.decisionEvidence) {
      try {
        verifiedEvidence = validateEvidenceDecision(decision, input.decisionEvidence);
      } catch (error) {
        decision = null;
        decisionError = error instanceof FleetError ? error.code : "DECISION_EVIDENCE_INVALID";
      }
    }
    if (
      !decisionError &&
      ((input.model.provider === "vllm" && !validate(decision)) || (nativeContract && !nativeContract(decision)))
    ) {
      decision = null;
      decisionError = "INVALID_MODEL_OUTPUT";
      verifiedEvidence = undefined;
    }
    return {
      decision,
      decisionError,
      ...(verifiedEvidence ? { verifiedEvidence } : {}),
      ...(providerMetadata ? { providerMetadata } : {}),
      ...("execution" in response ? { execution: response.execution } : {}),
      outputText: typeof message.content === "string" ? message.content : undefined,
      inputTokens: typeof i === "number" ? i : null,
      outputTokens: typeof o === "number" ? o : null,
    };
  }
}

export class RoutedModel implements ModelPort {
  contextWindow(model: import("./domain.js").ModelSettings) {
    return (model.route === "codex-cli" ? this.codex : this.http).contextWindow?.(model);
  }
  get tracksDispatch() {
    return this.http.tracksDispatch === true && this.codex.tracksDispatch === true;
  }
  constructor(
    private http: ModelPort,
    private codex: ModelPort,
  ) {}
  estimateInputTokens(input: Parameters<NonNullable<ModelPort["estimateInputTokens"]>>[0]) {
    if (!this.http.estimateInputTokens || input.model.route === "codex-cli")
      throw new FleetError("PROVIDER_TOKENIZER_REQUIRED", true);
    return this.http.estimateInputTokens(input);
  }
  decide(input: Parameters<ModelPort["decide"]>[0]) {
    return (input.model.route === "codex-cli" ? this.codex : this.http).decide(input);
  }
}
