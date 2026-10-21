import type { Data } from "../../domain.js";
import type { ArchitectureManifest, ValidationIssue } from "../../platform/architecture.js";
export const manifest: ArchitectureManifest = {
  schemaVersion: "fleet.architecture-manifest.v1",
  ref: { id: "reactive-cognition", version: "1" },
  name: "Reactive cognition",
  description: "Preserved version-one reactive cognition architecture.",
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  defaults: {},
  presets: [],
  requirements: { capabilities: { eventDelivery: ["native", "poll"], continuity: true } },
  triggers: ["periodic", "event", "deadline"],
  executionModes: ["serial"],
  observationOwner: "host",
  modules: [
    { id: "decision-step", version: "1" },
    { id: "continuity", version: "1" },
  ],
  stateCodecs: [{ id: "continuity", version: "1" }],
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
