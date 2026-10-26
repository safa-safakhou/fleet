import { expect, it } from "vitest";
import { config } from "../../src/config.js";
import { providerCapacity } from "../../src/platform/provider-policy.js";

const base = {
  DATABASE_URL: "postgres://fixture/fixture",
  FLEET_OPERATOR_SECRET: "fixture",
  FLEET_VAULT_KEY: "fixture",
};
it("opts vLLM into a shared token budget while leaving other routes unchanged", () => {
  const settings = config({ ...base, FLEET_VLLM_TOKEN_CAPACITY: "40000" });
  expect(
    providerCapacity(settings, { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" }),
  ).toMatchObject({ tokenCapacity: 40000 });
  expect(providerCapacity(settings, { route: "ollama", model: "synthetic" })).not.toHaveProperty("tokenCapacity");
  expect(() => config({ ...base, FLEET_VLLM_TOKEN_CAPACITY: "-1" })).toThrow();
});
it("configures workers independently of provider slots and preserves safe defaults", () => {
  const defaults = config(base);
  expect(defaults.maxConcurrency).toBe(1);
  expect(defaults.inferenceConcurrency).toEqual({ ollama: 1, "openai-compatible": 1 });
  expect(defaults.ollamaOptions).toEqual({ contextLength: 32768, keepAliveSeconds: 0 });
  const settings = config({
    ...base,
    FLEET_CONCURRENCY: "8",
    FLEET_OLLAMA_CONCURRENCY: "4",
    FLEET_OLLAMA_CONTEXT_LENGTH: "16384",
    FLEET_OLLAMA_KEEP_ALIVE_SECONDS: "300",
  });
  expect(settings.maxConcurrency).toBe(8);
  expect(providerCapacity(settings, { route: "ollama", model: "nemotron-3-nano:4b" }).capacity).toBe(4);
  expect(providerCapacity(settings, { route: "codex-cli", model: "synthetic" }).capacity).toBe(1);
  expect(settings.ollamaOptions).toEqual({ contextLength: 16384, keepAliveSeconds: 300 });
  expect(settings.liveAllowed).toBe(false);
});
it.each([
  ["FLEET_OLLAMA_CONCURRENCY", "0"],
  ["FLEET_OLLAMA_CONCURRENCY", "17"],
  ["FLEET_OLLAMA_CONCURRENCY", "1.2"],
  ["FLEET_COMPATIBLE_CONCURRENCY", "no"],
  ["FLEET_OLLAMA_CONTEXT_LENGTH", "0"],
  ["FLEET_OLLAMA_CONTEXT_LENGTH", "262145"],
  ["FLEET_OLLAMA_KEEP_ALIVE_SECONDS", "-1"],
  ["FLEET_OLLAMA_KEEP_ALIVE_SECONDS", "86401"],
])("rejects invalid %s=%s", (key, value) => {
  expect(() => config({ ...base, [key]: value })).toThrow();
});
it("refuses parallel vLLM admission without a physical cache profile", () => {
  const settings = config({ ...base, FLEET_COMPATIBLE_CONCURRENCY: "4", FLEET_VLLM_TOKEN_CAPACITY: "40000" });
  expect(() =>
    providerCapacity(settings, { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" }),
  ).toThrow("PROVIDER_CACHE_PROFILE_REQUIRED");
});
