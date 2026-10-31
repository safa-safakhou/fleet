import { z } from "zod";
import { type Data, FleetError } from "../../domain.js";
import type { ArchitectureDefinition, ValidationIssue } from "../../platform/architecture.js";
import type { ScopedOperation, ScopedServices } from "../../platform/engine-context.js";
import type { RunManifestInput } from "../manifests/compiler.js";
export const recipeIds = ["pact-research-deliberative", "pact-research-scripted", "pact-research-advisory"] as const;
export const recipeConfigSchema = {
  type: "object",
  description:
    "Experimental PACT recipe. Draft changes are validated in the sealed-manifest preview. Saving starts no work. A separate explicit task enrollment and run authorization are required.",
  additionalProperties: false,
  required: ["worker", "policy", "memoryNamespace", "contextPolicy", "maxSteps", "scriptedAction"],
  properties: {
    worker: { type: "string", enum: ["typescript-reference@1", "python-pydantic@1"], title: "Worker implementation" },
    policy: { type: "string", enum: ["pact-reference@1", "pact-scripted@1"], title: "PACT policy" },
    memoryNamespace: { type: "string", minLength: 1, maxLength: 100, title: "Private memory namespace" },
    contextPolicy: { type: "string", enum: ["observed-pact@1"], title: "Context policy" },
    maxSteps: { type: "integer", minimum: 1, maximum: 100, title: "Maximum reasoning steps" },
    scriptedAction: {
      type: "string",
      minLength: 0,
      maxLength: 100,
      title: "Scripted native action family (empty waits)",
    },
  },
};
export function recipeDefaults(id: string) {
  return {
    worker: "typescript-reference@1",
    policy: id === "pact-research-scripted" ? "pact-scripted@1" : "pact-reference@1",
    memoryNamespace: "pact-research",
    contextPolicy: "observed-pact@1",
    maxSteps: 4,
    scriptedAction: "",
  };
}
export const RecipeConfig = z
  .object({
    worker: z.enum(["typescript-reference@1", "python-pydantic@1"]),
    policy: z.enum(["pact-reference@1", "pact-scripted@1"]),
    memoryNamespace: z.string().min(1).max(100),
    contextPolicy: z.literal("observed-pact@1"),
    maxSteps: z.number().int().min(1).max(100),
    scriptedAction: z.string().max(100),
  })
  .strict();
export function validateRecipe(id: string, config: Data): ValidationIssue[] {
  const parsed = RecipeConfig.safeParse(config);
  if (!parsed.success)
    return [
      {
        path: "/architectureConfig",
        code: "INVALID_ARCHITECTURE_CONFIG",
        detail: "Invalid research recipe configuration",
      },
    ];
  if (
    (id === "pact-research-scripted") !== (parsed.data.policy === "pact-scripted@1") ||
    (id === "pact-research-scripted" && parsed.data.worker !== "typescript-reference@1") ||
    (id !== "pact-research-scripted" && parsed.data.scriptedAction)
  )
    return [
      {
        path: "/architectureConfig/policy",
        code: "RECIPE_COMPONENT_INCOMPATIBLE",
        detail: "Policy and worker must match the selected recipe",
      },
    ];
  return [];
}
export function recipeManifestIssues(input: RunManifestInput) {
  if (!recipeIds.includes(input.profile.id as (typeof recipeIds)[number])) return [];
  const issues: { path: string; code: string }[] = [];
  const fail = (path: string) => issues.push({ path, code: "RECIPE_COMPONENT_INCOMPATIBLE" });
  if (input.profile.version !== "1") fail("/profile/version");
  if (!["typescript-reference@1", "python-pydantic@1"].includes(input.components.worker)) fail("/components/worker");
  if (
    input.components.policy !== (input.profile.id === "pact-research-scripted" ? "pact-scripted@1" : "pact-reference@1")
  )
    fail("/components/policy");
  if (input.context.policy !== "observed-pact@1") fail("/context/policy");
  if (
    input.profile.id === "pact-research-advisory"
      ? input.roles.some((r) => r.authority !== "advisory")
      : !input.roles.some((r) => r.authority === "actor")
  )
    fail("/roles");
  if (input.clock.observationId !== "pact.game-time-ms") fail("/clock");
  if (
    input.context.compression ||
    input.retrieval.strategy !== "baseline-v1" ||
    input.memory.indexPolicy !== "disabled" ||
    input.memory.embedding
  )
    fail("/memory");
  if (input.profile.id === "pact-research-scripted" && input.components.worker !== "typescript-reference@1")
    fail("/components/worker");
  return issues;
}
export type RecipeRunner = (id: string, services: ScopedServices, operation: ScopedOperation) => Promise<void>;
export function pactReferenceDefinitions(run?: RecipeRunner): ArchitectureDefinition[] {
  return recipeIds.map((id) => ({
    manifest: {
      schemaVersion: "fleet.architecture-manifest.v1",
      ref: { id, version: "1" },
      name: `${id.replace("pact-research-", "")} (experimental)`,
      description:
        "Experimental PACT research recipe. Requires explicit sealed Temporal enrollment; saving configuration starts nothing.",
      configSchema: recipeConfigSchema,
      defaults: recipeDefaults(id),
      presets: [],
      requirements: {
        capabilities: { nativeIdempotency: true, outcomeLookup: true, coordination: true },
        schemas: { observations: ["pact.observation.v1"], actions: ["pact.action.v1"] },
      },
      triggers: ["event", "periodic", "deadline"],
      executionModes: ["serial"],
      observationOwner: "host",
      schedulerOwner: "temporal",
      modules: [],
      stateCodecs: [],
      skillModes: ["off"],
      form: {
        fields: Object.keys(recipeConfigSchema.properties).map((path) => ({
          path,
          label: path,
          widget: (path === "maxSteps"
            ? "number"
            : path === "worker" || path === "policy" || path === "contextPolicy"
              ? "enum"
              : "string") as "number" | "enum" | "string",
        })),
      },
    },
    validate: (config, launch) => {
      const issues = validateRecipe(id, config),
        model = launch.model as Data | undefined;
      if (model && (model.cognition || model.recallAssist))
        issues.push({
          path: "/model",
          code: "PROFILE_CONFIGURATION_MISMATCH",
          detail: "Research recipes use their sealed worker/context components",
        });
      return issues;
    },
    create: (services) => ({
      route: () => [],
      run: async (operation) => {
        if (!run) throw new FleetError("RESEARCH_RUNTIME_DISABLED", true);
        await run(id, services, operation);
      },
    }),
  }));
}
