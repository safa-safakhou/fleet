import { FleetError } from "../../domain.js";
import type { ArchitectureRef, ArchitectureRegistry, ArchitectureRuntime } from "../../platform/architecture.js";
import type { ScopedServices } from "../../platform/engine-context.js";
/** Keep the original identity/codecs, participant authority and arbitration owner intact. */
export function existingSpecialistBridge(
  registry: ArchitectureRegistry,
  ref: ArchitectureRef,
  services: ScopedServices,
) {
  if (!["specialist-coordinator", "autonomous-specialists"].includes(ref.id))
    throw new FleetError("SPECIALIST_BRIDGE_UNSUPPORTED", true);
  const original = registry.resolve(ref),
    runtime = original.create(services);
  return guardSpecialistRuntime(ref, runtime);
}
export function guardSpecialistRuntime(ref: ArchitectureRef, runtime: ArchitectureRuntime): ArchitectureRuntime {
  return {
    ...runtime,
    run: async (operation: Parameters<typeof runtime.run>[0]) => {
      if (operation.profile.id !== ref.id || operation.profile.version !== ref.version)
        throw new FleetError("PROFILE_CONFIGURATION_MISMATCH", true);
      return runtime.run(operation);
    },
  };
}
