import { z } from "zod";
import { FleetError } from "./domain.js";
import { parsePactFactRequests } from "./games/pact/requested-facts.js";
import { endpoint } from "./http.js";
import { loadCacheProfile } from "./platform/cache-profile.js";
export function config(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL,
    operatorSecret = env.FLEET_OPERATOR_SECRET,
    vaultKey = env.FLEET_VAULT_KEY;
  if (!databaseUrl || !operatorSecret || !vaultKey) throw new FleetError("PRIVATE_CONFIGURATION_REQUIRED");
  if ((env.FLEET_GAME ?? "pact") !== "pact") throw new FleetError("GAME_ADAPTER_UNSUPPORTED");
  const allowHttp = env.FLEET_ALLOW_HTTP === "1";
  const origin = endpoint(env.FLEET_ORIGIN ?? "http://127.0.0.1:8820", true),
    gameBase = endpoint(env.FLEET_GAME_BASE_URL ?? env.PACT_BASE_URL ?? "https://pact.tinyagenttools.com", allowHttp);
  return {
    researchRuntime: env.FLEET_RESEARCH_TEMPORAL_ADDRESS
      ? {
          address: z
            .string()
            .regex(/^(127\.0\.0\.1|localhost):[0-9]{1,5}$/)
            .parse(env.FLEET_RESEARCH_TEMPORAL_ADDRESS),
          namespace: z.string().min(1).max(200).parse(env.FLEET_RESEARCH_TEMPORAL_NAMESPACE),
          manifestDigest: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .parse(env.FLEET_RESEARCH_MANIFEST),
        }
      : undefined,
    observabilityEndpoint: env.FLEET_OBSERVABILITY_OTLP_URL,
    pactFactRequests: parsePactFactRequests(env.FLEET_PACT_FACT_REQUESTS),
    databaseUrl,
    databasePoolMax: z.coerce
      .number()
      .int()
      .min(1)
      .max(32)
      .parse(env.FLEET_DATABASE_POOL_MAX ?? 8),
    operatorSecret,
    vaultKey,
    origin,
    gameBase,
    gameId: "pact",
    pactCoordinationVersion: z.enum(["pact.coordination.v1"]).optional().parse(env.FLEET_PACT_COORDINATION_VERSION),
    pactOutlookVersion: z.enum(["pact.agent-outlook.v1"]).optional().parse(env.FLEET_PACT_OUTLOOK_VERSION),
    pactActionEffectsVersion: z
      .enum(["fleet.action-effects.v1"])
      .optional()
      .parse(env.FLEET_PACT_ACTION_EFFECTS_VERSION),
    pactEventFeedVersion: z.enum(["pact.agent-events.v1"]).optional().parse(env.FLEET_PACT_EVENT_FEED_VERSION),
    environment: {
      id: env.FLEET_ENVIRONMENT_ID ?? env.FLEET_GAME ?? "pact",
      version: env.FLEET_ENVIRONMENT_VERSION ?? "1",
      instanceId: env.FLEET_ENVIRONMENT_INSTANCE ?? gameBase,
    },
    liveAllowed: env.FLEET_LIVE_ENABLED === "1",
    keepAwake: env.FLEET_KEEP_AWAKE === "1",
    runWindowFile: env.FLEET_RUN_WINDOW_FILE,
    port: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.PORT ?? 8820),
    routes: {
      ollama: env.OLLAMA_BASE_URL ? endpoint(env.OLLAMA_BASE_URL, allowHttp) : undefined,
      "openai-compatible": env.MODEL_BASE_URL ? endpoint(env.MODEL_BASE_URL, allowHttp) : undefined,
    },
    apiKey: env.MODEL_API_KEY,
    vllmTerminalAccounting: z.enum(["0", "1"]).parse(env.FLEET_VLLM_TERMINAL_ACCOUNTING ?? "0") === "1",
    decisionEndpoint: env.FLEET_DECISION_URL ? decisionEndpoint(env.FLEET_DECISION_URL) : undefined,
    layaEndpoint: env.FLEET_LAYA_URL ? decisionEndpoint(env.FLEET_LAYA_URL) : undefined,
    codex: { executable: env.FLEET_CODEX_EXECUTABLE, home: env.FLEET_CODEX_HOME },
    maxConcurrency: z.coerce
      .number()
      .int()
      .min(1)
      .max(16)
      .parse(env.FLEET_CONCURRENCY ?? 1),
    inferenceConcurrency: {
      ollama: z.coerce
        .number()
        .int()
        .min(1)
        .max(16)
        .parse(env.FLEET_OLLAMA_CONCURRENCY ?? 1),
      "openai-compatible": z.coerce
        .number()
        .int()
        .min(1)
        .max(16)
        .parse(env.FLEET_COMPATIBLE_CONCURRENCY ?? 1),
    },
    vllmCacheProfile: loadCacheProfile(env.FLEET_VLLM_CACHE_PROFILE),
    vllmWaveWindowMs:
      env.FLEET_VLLM_WAVE_WINDOW_MS === undefined
        ? undefined
        : z.coerce.number().int().min(10).max(1000).parse(env.FLEET_VLLM_WAVE_WINDOW_MS),
    vllmTokenCapacity:
      env.FLEET_VLLM_TOKEN_CAPACITY === undefined
        ? undefined
        : z.coerce.number().int().min(1).max(4194304).parse(env.FLEET_VLLM_TOKEN_CAPACITY),
    ollamaOptions: {
      contextLength: z.coerce
        .number()
        .int()
        .min(512)
        .max(262144)
        .parse(env.FLEET_OLLAMA_CONTEXT_LENGTH ?? 32768),
      keepAliveSeconds: z.coerce
        .number()
        .int()
        .min(0)
        .max(86400)
        .parse(env.FLEET_OLLAMA_KEEP_ALIVE_SECONDS ?? 0),
    },
    researchWorker: env.FLEET_RESEARCH_PYTHON_IMAGE
      ? {
          mode: "container" as const,
          image: z
            .string()
            .regex(/^sha256:[a-f0-9]{64}$/)
            .parse(env.FLEET_RESEARCH_PYTHON_IMAGE),
        }
      : env.FLEET_RESEARCH_PYTHON_EXECUTABLE
        ? {
            mode: "native-development" as const,
            executable: z.string().min(1).parse(env.FLEET_RESEARCH_PYTHON_EXECUTABLE),
          }
        : undefined,
    statePath: env.FLEET_STATE_PATH ?? ".",
    minFreeBytes: z.coerce
      .number()
      .int()
      .min(0)
      .parse(env.FLEET_MIN_FREE_BYTES ?? 10 * 1024 ** 3),
  };
}

function decisionEndpoint(value: string) {
  const url = new URL(endpoint(value, true));
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:")
    throw new FleetError("DECISION_LOOPBACK_REQUIRED");
  return url.toString().replace(/\/$/, "");
}
