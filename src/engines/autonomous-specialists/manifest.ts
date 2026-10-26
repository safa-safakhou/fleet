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
    title: "Specialist configuration",
    properties: {
      preset: { type: "string", title: "Role preset", enum: ["resources-diplomacy", "full"] },
      learning: { type: "boolean", title: "Learn from observed episodes" },
      decisionContract: {
        type: "string",
        title: "Read and final-decision envelope",
        enum: ["read-final.v1", "read-final.v2", "read-final.v3"],
      },
      clockContract: { type: "string", title: "Scoped wake clocks", enum: ["scoped.v1", "scoped.v2"] },
      responseContract: { type: "string", enum: ["visible.v1"] },
      contextPackingContract: { type: "string", enum: ["required-first.v1", "required-first.v2"] },
      observationPolicyVersion: { type: "string", enum: ["2", "3", "4", "5"] },
      skillReferenceContract: { type: "string", enum: ["listed.v1"] },
      observationContract: {
        type: "string",
        title: "Environment observation semantics",
        enum: ["semantics.v1", "semantics.v2"],
      },
      temporalEvidenceContract: { type: "string", title: "Temporal evidence contract", enum: ["bounded.v1"] },
      participantContract: { type: "string", title: "Scoped participant contract", enum: ["scoped.v1"] },
      goalReferenceContract: { type: "string", title: "Scoped goal parents", enum: ["scoped.v1"] },
      intentAuthorityContract: {
        type: "string",
        title: "Owner intent and authorization",
        enum: ["separate.v1", "separate.v2", "separate.v3"],
      },
      readQueryContract: {
        type: "string",
        title: "Environment read contract",
        enum: ["environment.v1", "environment.v2", "environment.v3", "environment.v4"],
      },
      skillMode: { type: "string", title: "Skill reuse", enum: ["off", "advisory", "guarded"] },
      qualificationPolicy: { type: "string", title: "Trusted qualification policy", enum: ["skills-policy.v1"] },
      maxActiveGoals: { type: "integer", title: "Active goals per specialist", minimum: 1, maximum: 8 },
      memoryBytes: { type: "integer", title: "Evidence packet bytes", minimum: 1024, maximum: 12000 },
      ownerPriorities: {
        type: "object",
        title: "Owner priorities",
        properties: Object.fromEntries(
          ["resources", "diplomacy", "defense", "development"].map((id) => [
            id,
            { type: "integer", title: id.charAt(0).toUpperCase() + id.slice(1), minimum: 0, maximum: 100 },
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
    { id: "specialist-input", version: "1" },
  ],
  stateCodecs: [{ id: "participant-state", version: "1" }],
  skillModes: ["off", "advisory", "guarded"],
  form: {
    fields: [
      { path: "preset", label: "Role preset", widget: "enum" },
      { path: "maxActiveGoals", label: "Active goals per specialist", widget: "number" },
      { path: "memoryBytes", label: "Evidence packet limit", widget: "number" },
    ],
  },
};
