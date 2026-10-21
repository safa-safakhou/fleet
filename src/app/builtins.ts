import { FleetError } from "../domain.js";
import { definition as autonomous } from "../engines/autonomous-specialists/engine.js";
import { definition as continuity } from "../engines/continuity/engine.js";
import { definition as packingRepair } from "../engines/continuity/engine-packing-repair.js";
import { definition as continuityV2 } from "../engines/continuity/engine-v2.js";
import { legacyManifest, prepareLegacyModel, validateLegacy } from "../engines/legacy/manifest.js";
import { definition as reactive } from "../engines/reactive/engine.js";
import { definition as specialists } from "../engines/specialists/coordinator.js";
import { type ArchitectureDefinition, ArchitectureRegistry } from "../platform/architecture.js";
export function builtinArchitectures(
  factories: Record<string, ArchitectureDefinition["create"]> = {},
  additional: ArchitectureDefinition[] = [],
) {
  const definitions: (Pick<ArchitectureDefinition, "manifest" | "validate" | "prepareModel"> & {
    create?: ArchitectureDefinition["create"];
  })[] = [
    ...(["legacy-loop", "legacy-cognition"] as const).map((id) => ({
      manifest: legacyManifest(id),
      prepareModel: (model: import("../domain.js").ModelSettings) => prepareLegacyModel(id, model),
      validate: (
        config: Parameters<ArchitectureDefinition["validate"]>[0],
        launch: Parameters<ArchitectureDefinition["validate"]>[1],
      ) => validateLegacy(id, config, launch),
    })),
    reactive,
    continuity,
    continuityV2,
    packingRepair,
    specialists,
    autonomous,
    ...additional,
  ];
  return new ArchitectureRegistry(
    definitions.map((d) => ({
      ...d,
      create: (services) => {
        const factory = factories[`${d.manifest.ref.id}@${d.manifest.ref.version}`] ?? d.create;
        if (!factory) throw new FleetError("ARCHITECTURE_COMPOSITION_REQUIRED");
        return factory(services);
      },
    })),
  );
}
