import { expect, it } from "vitest";
import { specialistPackageSettings } from "../../scripts/lib/specialist-package.js";

it("describes KQ1's actual bounded settings without changing wire/model settings or borrowing E1 caps", () => {
  const original = {
    controller: { nodeExeSha256: "pinned" },
    provider: {
      request: { options: { num_predict: 2000, num_ctx: 32768 }, think: true, keep_alive: 0 },
      runtimeRootTemplate: "old/E1/runtime",
      childEnvironment: { OLLAMA_HOST: "127.0.0.1:11436", OLLAMA_VULKAN: "true", OLLAMA_MODELS: "old/E1/models" },
    },
    budget: { batch: { calls: 144 } },
    leases: { ttlMs: 900000, renewEveryMs: 300000 },
  };
  const result = specialistPackageSettings(original);
  expect(result.provider.request).toEqual(original.provider.request);
  expect(result.controller).toEqual(original.controller);
  expect(result.budget.batch).toMatchObject({
    calls: 288,
    reservedTokens: 11520000,
    turns: 96,
    wallDeadlineMs: 21600000,
  });
  expect(result.budget.cells.map((c) => [c.roles, c.calls, c.workLimits.reads])).toEqual([
    [2, 24, 256],
    [4, 48, 512],
  ]);
  expect(JSON.stringify(result)).not.toContain("old/E1");
  expect(original.provider.runtimeRootTemplate).toBe("old/E1/runtime");
});
