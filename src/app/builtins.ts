import { FleetError } from "../domain.js";
import { manifest as continuity, validate as validateContinuity } from "../engines/continuity/manifest.js";
import { legacyManifest, validateLegacy } from "../engines/legacy/manifest.js";
import { manifest as reactive, validate as validateReactive } from "../engines/reactive/manifest.js";
import { manifest as specialists, validate as validateSpecialists } from "../engines/specialists/manifest.js";
import { type ArchitectureDefinition, ArchitectureRegistry } from "../platform/architecture.js";
export function builtinArchitectures(factories: Record<string, ArchitectureDefinition["create"]> = {}) {
  const definitions: Pick<ArchitectureDefinition, "manifest" | "validate">[] = [
    ...(["legacy-loop", "legacy-cognition"] as const).map((id) => ({
      manifest: legacyManifest(id),
      validate: (
        config: Parameters<ArchitectureDefinition["validate"]>[0],
        launch: Parameters<ArchitectureDefinition["validate"]>[1],
      ) => validateLegacy(id, config, launch),
    })),
    { manifest: reactive, validate: validateReactive },
    { manifest: continuity, validate: validateContinuity },
    { manifest: specialists, validate: validateSpecialists },
  ];
  return new ArchitectureRegistry(
    definitions.map((d) => ({
      ...d,
      create: (services) => {
        const factory = factories[`${d.manifest.ref.id}@${d.manifest.ref.version}`];
        if (!factory) throw new FleetError("ARCHITECTURE_COMPOSITION_REQUIRED");
        return factory(services);
      },
    })),
  );
}
