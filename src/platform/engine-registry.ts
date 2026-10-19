import { type Data, FleetError, type Tool } from "../domain.js";
import type { ModelAdmission } from "./admission.js";
import type { BindingRef, CapabilityRequirements, Observation, SchemaRequirements } from "./contracts.js";
import type { CommandExecutor } from "./execution.js";
import type { EngineProfileRef } from "./profiles.js";
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
  accountObjective?: (observation: Observation) => string | undefined;
  trace?: (stage: "thinking" | "deciding", label: string, detail: Data) => Promise<void>;
  capabilities?: import("./contracts.js").Capabilities;
  validateProposal?: (
    proposal: import("./contracts.js").Proposal,
    observation: Observation,
  ) => Promise<{ valid: boolean; code: string }>;
  schemas?: { observations: string[]; actions: string[] };
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
  run(context: EngineContext): Promise<void>;
}
export class EngineRegistry {
  private engines = new Map<string, AgentEngine>();
  constructor(engines: AgentEngine[] = []) {
    for (const engine of engines) this.register(engine);
  }
  register(engine: AgentEngine) {
    const key = JSON.stringify([engine.ref.id, engine.ref.version]);
    if (this.engines.has(key)) throw new FleetError("DUPLICATE_ENGINE");
    this.engines.set(key, engine);
  }
  list() {
    return [...this.engines.values()];
  }
  resolve(ref: EngineProfileRef): AgentEngine {
    const engine = this.engines.get(JSON.stringify([ref.id, ref.version]));
    if (!engine) throw new FleetError("UNSUPPORTED_ENGINE");
    return engine;
  }
}
