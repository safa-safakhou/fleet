import type { ArchitectureManifest } from "../../platform/architecture.js";
export const defaults = {
  preset: "resources-diplomacy",
  maxActiveGoals: 8,
  memoryBytes: 6000,
  ownerPriorities: {},
  learning: true,
  skillMode: "advisory",
  qualificationPolicy: "skills-policy.v1",
};
export const manifest: ArchitectureManifest = {
  schemaVersion: "fleet.architecture-manifest.v1",
  ref: { id: "autonomous-specialists", version: "1" },
  name: "Autonomous specialists",
  description:
    "Persistent specialists with separate goals and memory, addressed work and one shared guarded action lane.",
  configSchema: {
    type: "object",
    properties: {
      preset: { type: "string", enum: ["resources-diplomacy", "full"] },
      learning: { type: "boolean" },
      skillMode: { type: "string", enum: ["off", "advisory"] },
      qualificationPolicy: { type: "string", enum: ["skills-policy.v1"] },
      maxActiveGoals: { type: "integer", minimum: 1, maximum: 8 },
      memoryBytes: { type: "integer", minimum: 1024, maximum: 12000 },
      ownerPriorities: {
        type: "object",
        properties: Object.fromEntries(
          ["resources", "diplomacy", "defense", "development"].map((id) => [
            id,
            { type: "integer", minimum: 0, maximum: 100 },
          ]),
        ),
        additionalProperties: false,
      },
    },
    required: ["preset", "maxActiveGoals", "memoryBytes"],
    additionalProperties: false,
  },
  defaults,
  presets: [
    { id: "resources-diplomacy", name: "Resources and diplomacy", config: defaults },
    { id: "full", name: "Resources, diplomacy, defense and development", config: { ...defaults, preset: "full" } },
  ],
  requirements: { capabilities: { eventDelivery: ["native", "poll"], outcomeLookup: true, actionEffects: true } },
  triggers: ["periodic", "event", "deadline", "internal-message"],
  executionModes: ["serial"],
  observationOwner: "host",
  modules: [
    { id: "participant-state", version: "1" },
    { id: "negotiation-evidence", version: "1" },
    { id: "action-admission", version: "1" },
    { id: "skills", version: "1" },
  ],
  stateCodecs: [{ id: "participant-state", version: "1" }],
  skillModes: ["off", "advisory"],
  form: {
    fields: [
      { path: "preset", label: "Role preset", widget: "enum" },
      { path: "maxActiveGoals", label: "Active goals per specialist", widget: "number" },
      { path: "memoryBytes", label: "Evidence packet limit", widget: "number" },
    ],
  },
};
