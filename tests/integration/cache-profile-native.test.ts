import { expect, it } from "vitest";
import { nativeArchitectureHarness, scriptedNativeProvider } from "../../scripts/lib/native-architecture-harness.js";
import { parseCacheProfile } from "../../src/platform/cache-profile.js";
import { cacheProfileFixture } from "../fixtures/cache-profile.js";
import { fixture } from "../helpers.js";

it.each([
  { input: 4000, expected: 4, blocks: 57 },
  { input: 8224, expected: 3, blocks: 57 },
  { input: 8224, expected: 4, blocks: 94 },
])(
  "shares block admission across all eight architectures at $expected concurrent scripted requests",
  async ({ input, expected, blocks }) => {
    const f = await fixture();
    let release!: () => void;
    const firstWave = new Promise<void>((r) => {
      release = r;
    });
    let active = 0;
    const h = await nativeArchitectureHarness(
      f.pool,
      {
        tracksDispatch: true,
        estimateInputTokens: async () => input,
        decide: async (request) => {
          active++;
          if (active === expected) release();
          await firstWave;
          try {
            return { ...(await scriptedNativeProvider.decide(request)), inputTokens: input };
          } finally {
            active--;
          }
        },
      },
      { route: "openai-compatible", provider: "vllm", model: "nemotron-4b" },
      undefined,
      { cacheProfile: parseCacheProfile({ ...cacheProfileFixture, poolBlocks: blocks }) },
    );
    try {
      await h.round(1);
      await h.drain();
      expect(new Set(h.roster.map((r) => r.architecture)).size).toBe(8);
      expect(h.peakCalls).toBe(expected);
      expect(h.runs.every((r) => r.code === "RETURNED")).toBe(true);
      expect(
        (await f.pool.query("SELECT count(*)::int n FROM sim_requests WHERE answered_at IS NOT NULL")).rows[0].n,
      ).toBe(24);
      expect((await f.pool.query("SELECT count(*)::int n FROM model_capacity_leases")).rows[0].n).toBe(0);
    } finally {
      release();
      await h.close();
      await f.pool.query("DROP TABLE IF EXISTS sim_requests,sim_messages,sim_receipts,sim_kingdoms");
      await f.pool.end();
    }
  },
  60000,
);
