import { FleetError, type ModelPort, object } from "./domain.js";
import { jsonRequest } from "./http.js";
export class HttpModel implements ModelPort {
  readonly tracksDispatch = true;
  constructor(
    private routes: { ollama?: string; "openai-compatible"?: string },
    private apiKey: string | undefined,
  ) {}
  async decide(input: Parameters<ModelPort["decide"]>[0]) {
    if (input.model.route === "codex-cli") throw new FleetError("CODEX_CONFIGURATION_REQUIRED", true);
    const base = this.routes[input.model.route];
    if (!base) throw new FleetError("MODEL_ENDPOINT_REQUIRED", true);
    const ollama = input.model.route === "ollama";
    if (!ollama && !this.apiKey) throw new FleetError("MODEL_CREDENTIAL_REQUIRED", true);
    const body = ollama
      ? {
          model: input.model.model,
          messages: input.messages,
          stream: false,
          format: input.schema,
          keep_alive: 0,
          ...(input.model.thinking !== undefined ? { think: input.model.thinking } : {}),
          options: { num_predict: input.maxOutputTokens, num_ctx: 32768 },
        }
      : {
          model: input.model.model,
          messages: input.messages,
          stream: false,
          max_completion_tokens: input.maxOutputTokens,
          response_format: {
            type: "json_schema",
            json_schema: { name: "fleet_decision", strict: false, schema: input.schema },
          },
        };
    await input.onDispatch?.();
    const { data } = await jsonRequest(
      `${base}${ollama ? "/api/chat" : "/chat/completions"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(!ollama ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify(body),
      },
      input.signal,
    );
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const message = ollama ? object(data.message) : object(object(choices[0]).message);
    const usage = object(data.usage),
      i = ollama ? data.prompt_eval_count : usage.prompt_tokens,
      o = ollama ? data.eval_count : usage.completion_tokens;
    // Usage belongs to the completed execution, even when its answer is unusable.
    let decision: unknown = null;
    let decisionError: string | undefined;
    try {
      if (typeof message.content !== "string") throw new Error("missing content");
      decision = JSON.parse(message.content);
    } catch {
      decisionError =
        data.done_reason === "length" || object(choices[0]).finish_reason === "length"
          ? "MODEL_OUTPUT_TRUNCATED"
          : "INVALID_MODEL_OUTPUT";
    }
    return {
      decision,
      decisionError,
      outputText: typeof message.content === "string" ? message.content : undefined,
      inputTokens: typeof i === "number" ? i : null,
      outputTokens: typeof o === "number" ? o : null,
    };
  }
}

export class RoutedModel implements ModelPort {
  get tracksDispatch() {
    return this.http.tracksDispatch === true && this.codex.tracksDispatch === true;
  }
  constructor(
    private http: ModelPort,
    private codex: ModelPort,
  ) {}
  decide(input: Parameters<ModelPort["decide"]>[0]) {
    return (input.model.route === "codex-cli" ? this.codex : this.http).decide(input);
  }
}
