import { expect, it } from "vitest";
import {
  cacheRequestBlocks,
  cacheResource,
  capacityDemand,
  parseCacheProfile,
} from "../../src/platform/cache-profile.js";
import { cacheProfileFixture } from "../fixtures/cache-profile.js";

it("accounts for fixed state and attention rounding at every supported length", () => {
  const p = parseCacheProfile(cacheProfileFixture);
  expect(cacheResource(p)).toMatchObject({ unit: "kv-cache-blocks.v1", capacity: 55 });
  for (let n = 1; n <= 16384; n++) expect(cacheRequestBlocks(p, n)).toBe(6 + Math.ceil(n / 976));
  expect(cacheRequestBlocks(p, 9760) * 4).toBe(64);
  expect(cacheRequestBlocks(p, 3904) * 4).toBe(40);
  expect(() => cacheRequestBlocks(p, 16385)).toThrow();
});
it("fingerprints topology and instance rather than only the token equivalent", () => {
  const p = parseCacheProfile(cacheProfileFixture);
  for (const change of [{ instanceId: "other-instance" }, { poolBlocks: 58 }, { engineConfigSha256: "a".repeat(64) }])
    expect(cacheResource(parseCacheProfile({ ...p, ...change })).fingerprint).not.toBe(cacheResource(p).fingerprint);
});
it.each([
  { prefixCaching: true },
  { speculativeDecoding: true },
  { poolBlocks: 2 },
  { groups: [{ kind: "sliding-window", blockTokens: 976 }] },
  { groups: [{ kind: "mamba", mode: "align", blocksPerRequest: 2 }] },
  { safetyBlocks: 0 },
])("refuses unsupported cache metadata %j", (change) => {
  expect(() => parseCacheProfile({ ...cacheProfileFixture, ...change })).toThrow();
});
it("measures tokens once while retaining separate physical resource and token units", async () => {
  let calls = 0;
  const p = parseCacheProfile(cacheProfileFixture);
  const result = await capacityDemand(
    {
      estimateInputTokens: async () => {
        calls++;
        return 8224;
      },
    },
    p,
    {
      model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" },
      messages: [],
      schema: {},
      maxOutputTokens: 1536,
      signal: AbortSignal.timeout(1000),
    },
  );
  expect(result).toEqual({ tokenUnits: 9760, resourceUnits: 16 });
  expect(calls).toBe(1);
});
it("rejects a selected model that does not match the attested cache", async () => {
  let calls = 0;
  await expect(
    capacityDemand(
      {
        estimateInputTokens: async () => {
          calls++;
          return 8224;
        },
      },
      parseCacheProfile(cacheProfileFixture),
      {
        model: { route: "openai-compatible", provider: "vllm", model: "wrong-model" },
        messages: [],
        schema: {},
        maxOutputTokens: 1536,
        signal: AbortSignal.timeout(1000),
      },
    ),
  ).rejects.toMatchObject({ code: "PROVIDER_CACHE_PROFILE_MISMATCH", notDispatched: true });
  expect(calls).toBe(0);
});

it("refuses malformed measurements before resource reservation", async () => {
  for (const count of [0, -1, NaN, 0.5])
    await expect(
      capacityDemand({ estimateInputTokens: async () => count }, parseCacheProfile(cacheProfileFixture), {
        model: { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" },
        messages: [],
        schema: {},
        maxOutputTokens: 1,
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_CONTEXT_CAPACITY", notDispatched: true });
});
it("checks endpoint and configured concurrency against the attested provider", async () => {
  const { assertCacheSelection } = await import("../../src/platform/cache-profile.js");
  const p = parseCacheProfile(cacheProfileFixture),
    m = { route: "openai-compatible" as const, provider: "vllm" as const, model: "nemotron-4b" };
  expect(() => assertCacheSelection(p, m, "http://127.0.0.1:18535/v1", 4)).not.toThrow();
  expect(() => assertCacheSelection(p, m, "http://127.0.0.1:9999/v1", 4)).toThrow();
  expect(() => assertCacheSelection(p, m, p.endpoint, 5)).toThrow();
});
it("loads only bounded valid operator cache profiles", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { loadCacheProfile } = await import("../../src/platform/cache-profile.js");
  const root = mkdtempSync(join(tmpdir(), "fleet-profile-test-")),
    path = join(root, "profile.json");
  try {
    expect(loadCacheProfile(undefined)).toBeUndefined();
    expect(() => loadCacheProfile(path)).toThrow();
    writeFileSync(path, JSON.stringify(cacheProfileFixture));
    expect(loadCacheProfile(path)?.poolBlocks).toBe(57);
    writeFileSync(path, " ".repeat(65537));
    expect(() => loadCacheProfile(path)).toThrow();
  } finally {
    rmSync(root, { recursive: true });
  }
});
