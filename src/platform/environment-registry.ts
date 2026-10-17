import { FleetError } from "../domain.js";
import type {
  ActionOutcome,
  BindingRef,
  CapabilityRequirements,
  EnvironmentAdapter,
  EnvironmentRef,
  EnvironmentSession,
  SchemaRequirements,
} from "./contracts.js";
export function sameEnvironment(a: EnvironmentRef, b: EnvironmentRef) {
  return a.id === b.id && a.version === b.version && a.instanceId === b.instanceId;
}
export function scopedSource(binding: BindingRef, source: string) {
  return JSON.stringify([
    binding.environment.id,
    binding.environment.version,
    binding.environment.instanceId,
    binding.actorRef,
    binding.entityRef,
    source,
  ]);
}
export function requireCapabilities(
  adapter: EnvironmentAdapter,
  required: CapabilityRequirements = {},
  schemas: SchemaRequirements = {},
) {
  const c = adapter.capabilities;
  if (
    (required.eventDelivery && !required.eventDelivery.some((mode) => mode === c.events)) ||
    (required.timing && !required.timing.includes(c.timing)) ||
    (required.nativeIdempotency && c.idempotency !== "native") ||
    (
      ["outcomeLookup", "parallelReasoning", "social", "simulationControls", "continuity", "coordination"] as const
    ).some((key) => required[key] && !c[key])
  )
    throw new FleetError("UNSUPPORTED_CAPABILITY");
  if (
    schemas.observations?.some((id) => !adapter.schemas.observations.includes(id)) ||
    schemas.actions?.some((id) => !adapter.schemas.actions.includes(id))
  )
    throw new FleetError("UNSUPPORTED_SCHEMA");
}
export class EnvironmentRegistry {
  private readonly adapters = new Map<string, EnvironmentAdapter>();
  readonly selected: EnvironmentRef;
  constructor(adapters: EnvironmentAdapter[], selected: EnvironmentRef) {
    this.selected = { ...selected };
    for (const adapter of adapters) {
      const key = JSON.stringify([adapter.ref.id, adapter.ref.version]);
      if (this.adapters.has(key)) throw new FleetError("DUPLICATE_ENVIRONMENT");
      this.adapters.set(key, adapter);
    }
    this.resolve(selected);
  }
  resolve(ref: EnvironmentRef) {
    const adapter = this.adapters.get(JSON.stringify([ref.id, ref.version]));
    if (!adapter) throw new FleetError("UNSUPPORTED_ENVIRONMENT");
    if (!sameEnvironment(ref, this.selected)) throw new FleetError("ENVIRONMENT_NOT_SELECTED");
    return adapter;
  }
  async connect(
    input: BindingRef,
    required: CapabilityRequirements = {},
    schemas: SchemaRequirements = {},
  ): Promise<EnvironmentSession> {
    const binding = structuredClone(input),
      adapter = this.resolve(binding.environment);
    requireCapabilities(adapter, required, schemas);
    const session = await adapter.connect(binding);
    if (adapter.capabilities.events !== "none" && !session.events) {
      await session.close();
      throw new FleetError("UNSUPPORTED_CAPABILITY");
    }
    if (adapter.capabilities.coordination && !session.validateProposal) {
      await session.close();
      throw new FleetError("COORDINATION_PROTOCOL_REQUIRED");
    }
    const outcome = (result: ActionOutcome, id: string): ActionOutcome => {
      if (result.commandId !== id || !["confirmed", "rejected", "pending", "unknown"].includes(result.status))
        throw new FleetError("OUTCOME_MISMATCH");
      return { ...result, sourceRefs: result.sourceRefs.map((ref) => scopedSource(binding, ref)) };
    };
    return {
      observe: async (query) => {
        const result = await session.observe(query);
        if (!adapter.schemas.observations.includes(result.schemaId)) throw new FleetError("UNSUPPORTED_SCHEMA");
        return {
          ...result,
          sourceRefs: result.sourceRefs.map((ref) => scopedSource(binding, ref)),
          ...(result.coordination
            ? {
                coordination: {
                  ...result.coordination,
                  focuses: result.coordination.focuses.map((focus) => ({
                    ...focus,
                    sourceRefs: focus.sourceRefs.map((ref) => {
                      if (!result.sourceRefs.includes(ref)) throw new FleetError("UNSCOPED_EVIDENCE");
                      return scopedSource(binding, ref);
                    }),
                  })),
                },
              }
            : {}),
          ...(result.continuity
            ? {
                continuity: {
                  ...result.continuity,
                  facts: result.continuity.facts.map((fact) => {
                    if (!result.sourceRefs.includes(fact.sourceRef)) throw new FleetError("UNSCOPED_EVIDENCE");
                    return { ...fact, sourceRef: scopedSource(binding, fact.sourceRef) };
                  }),
                },
              }
            : {}),
        };
      },
      catalog: () => session.catalog(),
      ...(session.validateProposal ? { validateProposal: session.validateProposal.bind(session) } : {}),
      execute: async (intent) => {
        if (intent.bindingId !== binding.id) throw new FleetError("BINDING_MISMATCH");
        if (!adapter.schemas.actions.includes(intent.schemaId)) throw new FleetError("UNSUPPORTED_SCHEMA");
        return outcome(await session.execute(intent), intent.commandId);
      },
      resolve: async (id) =>
        adapter.capabilities.outcomeLookup
          ? outcome(await session.resolve(id), id)
          : { commandId: id, status: "unknown", code: "OUTCOME_LOOKUP_UNAVAILABLE", sourceRefs: [] },
      ...(session.events && adapter.capabilities.events !== "none"
        ? {
            events: async (cursor: string | null) => {
              const page = await session.events?.(cursor);
              if (!page) throw new FleetError("UNSUPPORTED_CAPABILITY");
              return {
                ...page,
                events: page.events.map((event) => ({ ...event, sourceRef: scopedSource(binding, event.sourceRef) })),
              };
            },
          }
        : {}),
      close: () => session.close(),
    };
  }
}
