import type { ArchitectureManifest } from "../../platform/architecture.js";
export const manifest: ArchitectureManifest = {
  schemaVersion: "fleet.architecture-manifest.v1",
  ref: { id: "reactive-cognition", version: "2" },
  name: "Reactive cognition v2",
  description: "Outcome-grounded negotiation evidence and explicit memory acknowledgments.",
  configSchema: { type: "object", properties: {}, additionalProperties: false },
  defaults: {},
  presets: [],
  requirements: { capabilities: { continuity: true } },
  triggers: ["periodic", "event", "deadline"],
  executionModes: ["serial"],
  observationOwner: "host",
  modules: [
    { id: "decision-step", version: "1" },
    { id: "negotiation-evidence", version: "1" },
  ],
  stateCodecs: [{ id: "negotiation-memory", version: "2" }],
  skillModes: ["off"],
  form: { fields: [] },
};
