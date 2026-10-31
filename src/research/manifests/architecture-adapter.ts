import { type Data, FleetError } from "../../domain.js";
import { RecipeConfig, recipeIds, validateRecipe } from "../recipes/pact-reference.js";
import { type CapabilityFingerprint, compileManifest, type RunManifestInput } from "./compiler.js";
/** Preview-only mapping. Does not save, enroll, grant authority or call external systems. */
export function compileRecipeManifest(input: RunManifestInput, config: Data, capability: CapabilityFingerprint) {
  if (
    !recipeIds.includes(input.profile.id as (typeof recipeIds)[number]) ||
    validateRecipe(input.profile.id, config).length
  )
    throw new FleetError("RECIPE_COMPONENT_INCOMPATIBLE", true);
  const selected = RecipeConfig.parse(config);
  return compileManifest(
    {
      ...input,
      components: { ...input.components, worker: selected.worker, policy: selected.policy },
      context: { ...input.context, policy: selected.contextPolicy },
      memory: { ...input.memory, namespace: selected.memoryNamespace },
    },
    capability,
  );
}
