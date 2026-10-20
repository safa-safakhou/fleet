import type { Data } from "../../domain.js";
import type { ArchitectureManifest, ValidationIssue } from "../../platform/architecture.js";
export function legacyManifest(id: "legacy-loop" | "legacy-cognition"): ArchitectureManifest {
  return {
    schemaVersion: "fleet.architecture-manifest.v1",
    ref: { id, version: "1" },
    name: id === "legacy-loop" ? "Legacy loop" : "Legacy cognition",
    description: "Preserved historical compatibility controller.",
    configSchema: { type: "object", properties: {}, additionalProperties: false },
    defaults: {},
    presets: [],
    requirements: {
      capabilities: { timing: ["realtime"] },
      schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
    },
    triggers: ["periodic"],
    executionModes: ["serial"],
    observationOwner: "engine",
    modules: [],
    stateCodecs: [],
    skillModes: ["off"],
    form: { fields: [] },
  };
}
export function validateLegacy(id: string, _config: Data, launch: Data): ValidationIssue[] {
  const model = launch.model as Data | undefined;
  if (!model) return [];
  return (id === "legacy-loop" && model.cognition) || (id === "legacy-cognition" && !model.cognition)
    ? [
        {
          path: "/model/cognition",
          code: "PROFILE_CONFIGURATION_MISMATCH",
          detail: "Legacy cognition setting must match the selected exact profile.",
        },
      ]
    : [];
}

export function prepareLegacyModel(
  id: string,
  model: import("../../domain.js").ModelSettings,
): import("../../domain.js").ModelSettings {
  return id === "legacy-cognition" ? { ...model, cognition: "llm-centered-v1" } : model;
}
