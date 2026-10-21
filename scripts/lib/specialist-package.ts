import { object } from "../../src/domain.js";
export function specialistPackageSettings<
  T extends {
    controller: unknown;
    provider: { request: unknown; childEnvironment: Record<string, unknown> };
    leases: unknown;
  },
>(base: T) {
  const original = structuredClone(base);
  return {
    ...original,
    schemaVersion: "fleet.specialist-qualification-settings.v1",
    provider: {
      ...original.provider,
      runtimeRootTemplate: "%LOCALAPPDATA%/PACT/Negotiation/bundles/<artifactUUID>/runtime",
      childEnvironment: {
        ...original.provider.childEnvironment,
        OLLAMA_MODELS: "%LOCALAPPDATA%/PACT/Negotiation/provider-stores/<storeUUID>",
      },
    },
    budget: {
      cells: [2, 4].map((roles) => ({
        roles,
        turnsPerRole: 4,
        turns: roles * 4,
        calls: roles * 12,
        reservedTokens: roles * 480000,
        wallDeadlineMs: 2700000,
        gameHorizonMinutes: 120,
        inputBytes: 24000,
        outputTokens: 2000,
        reservationPerCall: 40000,
        maxCallsPerTurn: 3,
        maxActionsPerTurn: 3,
        concurrency: 1,
        workLimits: {
          reads: roles * 128,
          actions: roles * 12,
          messages: roles * 32,
          steps: roles * 256,
          wallTimeMs: 7200000,
        },
      })),
      batch: {
        calls: 288,
        reservedTokens: 11520000,
        turns: 96,
        wallDeadlineMs: 21600000,
        providerSlots: 1,
        helpers: 0,
      },
      accounting:
        "Native compute/command/skill work ledgers; every learning, correction and fallback call counts. Unknown usage keeps its full reservation and null measurement.",
    },
    leases: {
      ...object(original.leases),
      scope: "Eight fresh model kingdoms and eight disclosed scripted peers only; same account/holder/lease IDs",
    },
    architecture: {
      id: "autonomous-specialists",
      version: "1",
      presets: ["resources-diplomacy", "full"],
      skillModes: ["advisory", "guarded"],
      learning: true,
      maxActiveGoals: 8,
      memoryBytes: 6000,
    },
    diagnosticOnly: true,
    productionQualification: false,
  };
}
