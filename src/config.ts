import { z } from "zod";
import { FleetError } from "./domain.js";
import { endpoint } from "./http.js";
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
    databaseUrl,
    operatorSecret,
    vaultKey,
    origin,
    gameBase,
    gameId: "pact",
    liveAllowed: env.FLEET_LIVE_ENABLED === "1",
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
    codex: { executable: env.FLEET_CODEX_EXECUTABLE, home: env.FLEET_CODEX_HOME },
    maxConcurrency: z.coerce
      .number()
      .int()
      .min(1)
      .max(16)
      .parse(env.FLEET_CONCURRENCY ?? 1),
    statePath: env.FLEET_STATE_PATH ?? ".",
    minFreeBytes: z.coerce
      .number()
      .int()
      .min(0)
      .parse(env.FLEET_MIN_FREE_BYTES ?? 10 * 1024 ** 3),
  };
}
