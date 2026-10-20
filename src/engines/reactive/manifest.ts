import type { Data } from "../../domain.js";
import type { ArchitectureManifest, ValidationIssue } from "../../platform/architecture.js";
export const manifest: ArchitectureManifest = {
  schemaVersion: "fleet.architecture-manifest.v1",
  ref: { id: "reactive-basic", version: "1" },
  name: "Reactive basic",
  description: "Preserved version-one reactive basic architecture.",
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  defaults: {},
  presets: [],
  requirements: { capabilities: { eventDelivery: ["native", "poll"] } },
  triggers: ["periodic", "event", "deadline"],
  executionModes: ["serial"],
  observationOwner: "host",
  modules: [{ id: "decision-step", version: "1" }],
  stateCodecs: [],
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
