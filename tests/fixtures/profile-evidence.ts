import type { EnvironmentAdapter } from "../../src/platform/contracts.js";
import type { EngineProfileRef } from "../../src/platform/profiles.js";
import { adapterDigest, type ProfileEvidence } from "../../src/qualification.js";
export const requiredChecks = [
  "baselinePreservation",
  "capabilityAcceptance",
  "unknownUsageRetention",
  "pendingReconciliation",
  "authorization",
  "accounting",
  "stopFencing",
  "retention",
  "events",
  "continuity",
  "coordination",
  "actionEffects",
  "specialistState",
  "addressedDelivery",
  "independentActions",
  "skillsAdvisory",
  "skillsGuarded",
  "skillRecovery",
  "skillInvalidation",
  "nonModelLimits",
  "completeSkillCost",
];
export function evidence(
  adapter: EnvironmentAdapter,
  profile: EngineProfileRef,
  kind: ProfileEvidence["kind"] = "deterministic_fake",
): ProfileEvidence {
  return {
    kind,
    profile,
    environment: { ...adapter.ref, instanceId: "fixture:qualification" },
    passed: true,
    sourceRefs: [`fixture:${kind}:reviewed-artifact`],
    coverage: {
      schemaVersion: "fleet.profile-evidence.v1",
      fleetCommit: "a".repeat(40),
      environmentCommit: "b".repeat(40),
      contractsDigest: "f".repeat(64),
      configurationDigest: "c".repeat(64),
      adapterDigest: adapterDigest(adapter),
      checks: Object.fromEntries(requiredChecks.map((k) => [k, true])),
      outputs: [
        {
          schema: {
            type: "object",
            properties: { kind: { const: "wait" } },
            required: ["kind"],
            additionalProperties: false,
          },
          messages: [],
          output: { kind: "wait" },
          expectedValid: true,
          limit: 24000,
        },
      ],
      provider:
        kind === "real_provider"
          ? {
              route: "fixture-route",
              model: "fixture-model",
              settingsDigest: "d".repeat(64),
              checks: { usage: true, timeout: true, output: true, capacity: true },
            }
          : null,
    },
  };
}
