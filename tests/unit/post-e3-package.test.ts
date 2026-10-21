import { expect, it } from "vitest";
import { postE3PackageSettings } from "../../scripts/lib/post-e3-package.js";

it("packages the separate R1 proposal with exact shared limits and unchanged provider wire settings", () => {
  const original = {
    controller: { nodeExeSha256: "pinned" },
    provider: {
      request: { think: true, options: { num_ctx: 32768, num_predict: 2000 }, keep_alive: 0 },
      childEnvironment: { OLLAMA_HOST: "127.0.0.1:11436", OLLAMA_VULKAN: "true", OLLAMA_MODELS: "old/E1/models" },
    },
    leases: { ttlMs: 900000, renewEveryMs: 300000 },
    budget: { batch: { calls: 144 } },
  };
  const settings = postE3PackageSettings(original);
  expect(settings.schemaVersion).toBe("fleet.rc1-settings.v2");
  expect(settings.provider.request).toEqual(original.provider.request);
  expect(settings.controller).toEqual(original.controller);
  expect(
    settings.budget.stages.map((s) => [s.stage, s.cells.length, s.calls, s.reservedTokens, s.wallDeadlineMs]),
  ).toEqual([
    ["R1-D", 4, 288, 11520000, 43200000],
    ["R1-H", 35, 1230, 49200000, 184500000],
    ["R1-N", 2, 144, 5760000, 21600000],
  ]);
  expect(settings.budget.stages[0].cells.every((c) => c.turnsPerKingdom === 48 && c.calls === 72)).toBe(true);
  expect(settings.architecture.configuration).toMatchObject({ preset: "full", skillMode: "guarded", learning: true });
  expect(settings.scheduling).toMatchObject({
    periodicMinutes: 15,
    eventTriggeredTurns: false,
    providerSlots: 1,
    helpers: 0,
  });
  expect(settings.realProviderAuthorized).toBe(false);
  expect(settings.productionQualification).toBe(false);
  expect(JSON.parse(JSON.stringify(settings))).toEqual(settings);
  expect(JSON.stringify(settings)).not.toContain("old/E1");
  expect(original.provider.childEnvironment.OLLAMA_MODELS).toBe("old/E1/models");
});

it("keeps RC2's larger byte cap in a distinct passive package without changing provider context or old settings", () => {
  const original = {
    controller: {},
    provider: { request: { think: true, options: { num_ctx: 32768, num_predict: 2000 } }, childEnvironment: {} },
    leases: {},
  };
  const old = postE3PackageSettings(original),
    next = postE3PackageSettings(original, "RC2");
  expect(next.schemaVersion).toBe("fleet.rc2-settings.v1");
  expect(next.study).toBe("negotiation-r2");
  expect(next.scheduling.inputBytes).toBe(32000);
  expect(next.scheduling.periodicMinutes).toBe(30);
  expect(old.scheduling.inputBytes).toBe(24000);
  expect(next.provider.request).toEqual(old.provider.request);
  expect(next.budget.stages.map((s) => [s.calls, s.reservedTokens, s.wallDeadlineMs])).toEqual(
    old.budget.stages.map((s) => [s.calls, s.reservedTokens, s.wallDeadlineMs]),
  );
  expect(next.budget.stages.every((s) => s.stage.startsWith("R2-"))).toBe(true);
});
