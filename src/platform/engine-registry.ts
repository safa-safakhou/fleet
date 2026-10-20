import { type Data, FleetError, type Tool } from "../domain.js";
import type { ModelAdmission } from "./admission.js";
import type { EngineProfileRef } from "./architecture.js";
import type { BindingRef, CapabilityRequirements, Observation, SchemaRequirements } from "./contracts.js";
import type { CommandExecutor } from "./execution.js";
import type { TaskClaim, TaskRecord } from "./tasks.js";
export interface EngineContext {
  claim: TaskClaim;
  binding: BindingRef;
  task: TaskRecord;
  observation: Observation;
  model: ModelAdmission;
  commands: CommandExecutor;
  observe: (query: Data) => Promise<Observation>;
  eventRefs: string[];
  signal: AbortSignal;
  goal?: string;
  instructions?: string;
  accountObjective?: (observation: Observation) => import("./contracts.js").AccountObjective | undefined;
  trace?: (stage: "thinking" | "deciding", label: string, detail: Data) => Promise<void>;
  capabilities?: import("./contracts.js").Capabilities;
  validateProposal?: (
    proposal: import("./contracts.js").Proposal,
    observation: Observation,
  ) => Promise<import("./contracts.js").ProposalValidation>;
  schemas?: { observations: string[]; actions: string[] };
  waitSchema?: (observation: Observation) => Promise<Data | undefined>;
  validateWait?: (basis: Data, observation: Observation) => Promise<import("./contracts.js").ProposalValidation>;
  actionContracts?: (observation: Observation) => Promise<import("./contracts.js").ActionContract[]>;
  packObservation?: (observation: Observation, byteLimit: number) => Observation;
  catalog?: () => Promise<Tool[]>;
  waitForEvent?: () => Promise<void>;
}
export interface AgentEngine {
  ref: EngineProfileRef;
  requiredCapabilities: CapabilityRequirements;
  requiredSchemas?: SchemaRequirements;
  observationOwner?: "host" | "engine";
  executionModes?: ("serial" | "sibling-reasoning")[];
  run(context: EngineContext): Promise<void>;
}
export type ScopedAgentEngine = Omit<AgentEngine, "run"> & {
  manifest: import("./architecture.js").ArchitectureManifest;
  create(services: import("./engine-context.js").ScopedServices): import("./architecture.js").ArchitectureRuntime;
  run?: (context: never) => Promise<void>;
};
export type RegisteredEngine = AgentEngine | ScopedAgentEngine;
export class EngineRegistry {
  private engines = new Map<string, RegisteredEngine>();
  constructor(
    engines: RegisteredEngine[] = [],
    readonly architectures?: import("./architecture.js").ArchitectureRegistry,
  ) {
    for (const engine of engines) this.register(engine);
    for (const manifest of architectures?.list() ?? []) {
      if (this.engines.has(JSON.stringify([manifest.ref.id, manifest.ref.version]))) continue;
      this.register({
        manifest,
        ref: manifest.ref,
        requiredCapabilities: manifest.requirements.capabilities,
        requiredSchemas: manifest.requirements.schemas,
        observationOwner: manifest.observationOwner,
        executionModes: manifest.executionModes,
        create: (services) => {
          if (!architectures) throw new FleetError("UNSUPPORTED_ARCHITECTURE");
          return architectures.resolve(manifest.ref).create(services);
        },
      });
    }
  }
  register(engine: AgentEngine): void;
  register(engine: ScopedAgentEngine): void;
  register(engine: RegisteredEngine): void;
  register(engine: RegisteredEngine) {
    const key = JSON.stringify([engine.ref.id, engine.ref.version]);
    if (this.engines.has(key)) throw new FleetError("DUPLICATE_ENGINE");
    this.engines.set(key, engine);
  }
  list() {
    return [...this.engines.values()];
  }
  resolve(ref: EngineProfileRef): RegisteredEngine {
    const engine = this.engines.get(JSON.stringify([ref.id, ref.version]));
    if (!engine) throw new FleetError("UNSUPPORTED_ENGINE");
    return engine;
  }
}
