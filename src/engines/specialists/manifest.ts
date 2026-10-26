import type { Data } from "../../domain.js";
import type { ArchitectureManifest, ValidationIssue } from "../../platform/architecture.js";
export const manifest: ArchitectureManifest = {
  schemaVersion: "fleet.architecture-manifest.v1",
  ref: { id: "specialist-coordinator", version: "1" },
  name: "Specialist coordinator",
  description: "Preserved version-one specialist coordinator architecture.",
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  defaults: {},
  presets: [],
  requirements: { capabilities: { continuity: true, coordination: true } },
  triggers: ["periodic", "event", "deadline"],
  executionModes: ["serial", "sibling-reasoning"],
  observationOwner: "host",
  modules: [
    { id: "continuity", version: "1" },
    { id: "proposals", version: "1" },
  ],
  stateCodecs: [
    { id: "continuity", version: "1" },
    { id: "coordinator-focus", version: "1" },
  ],
  skillModes: ["off"],
  form: { fields: [] },
};
export function validate(_config: Data, launch: Data): ValidationIssue[] {
  const model = launch.model as Data | undefined;
  return model && (model.cognition || model.recallAssist)
    ? [
        {
          path: "/model",
          code: "PROFILE_CONFIGURATION_MISMATCH",
          detail: "This architecture uses its registered continuity policy, not legacy flags.",
        },
      ]
    : [];
}
