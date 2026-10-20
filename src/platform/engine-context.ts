import type { BudgetConfig, Data, ModelPort, ModelSettings, Tool } from "../domain.js";
import type { ArchitectureRef } from "./architecture.js";
import type {
  AccountObjective,
  ActionContract,
  ActionIntent,
  ActionOutcome,
  BindingRef,
  Capabilities,
  EnvironmentEvent,
  Observation,
  Proposal,
  ProposalValidation,
} from "./contracts.js";
export type ScopedEvent = { instanceId: string; binding: BindingRef; event: EnvironmentEvent };
export type ScopedOperation = {
  id: string;
  instanceId: string;
  binding: BindingRef;
  profile: ArchitectureRef;
  task: { id: string; key: string; revision: number; sourceCount: number; sourceRefsOmitted: number };
  signal: AbortSignal;
  observation: Observation;
  eventRefs: string[];
  participantId?: string;
};
export type ScopedModelRequest = {
  messages: Parameters<ModelPort["decide"]>[0]["messages"];
  schema: Data;
  maxOutputTokens: number;
  signal?: AbortSignal;
  stage?: { kind: "worker" | "coordinator"; focusId?: string; retryReserveCalls?: number };
};
export type ScopedModelResult = Awaited<ReturnType<ModelPort["decide"]>> & { allocationId: string };
export type ScopedEvidence = { id: string; kind: string; detail: Data; sourceRefs: string[] };
export interface ScopedServices {
  continuity?: import("../modules/continuity/v1/ports.js").ContinuityV1Ports;
  configuration: Readonly<{
    model: ModelSettings;
    budget: BudgetConfig;
    architectureConfig: Data;
    goal?: string;
    instructions?: string;
    parentBudgetId?: string;
  }>;
  observe(query: Data): Promise<Observation>;
  model: { decide(request: ScopedModelRequest): Promise<ScopedModelResult>; remainingCalls(): Promise<number> };
  actions: { submit(intent: ActionIntent): Promise<ActionOutcome>; resolve(commandId: string): Promise<ActionOutcome> };
  state: {
    load(codec: string): Promise<{ version: number; value: Data } | null>;
    accept(input: {
      codec: string;
      expectedVersion: number;
      value: Data;
    }): Promise<{ version: number; accepted: boolean }>;
  };
  evidence: {
    capture(input: { kind: string; detail: Data; sourceRefs: string[] }): Promise<ScopedEvidence>;
    retained(ids: string[]): Promise<ScopedEvidence[]>;
  };
  tasks: { waitForEvent(): Promise<void> };
  trace(stage: "thinking" | "deciding", label: string, detail: Data): Promise<void>;
  environment: {
    capabilities: Capabilities;
    schemas: { observations: string[]; actions: string[] };
    accountObjective?(observation: Observation): AccountObjective | undefined;
    catalog(): Promise<Tool[]>;
    validateProposal?(proposal: Proposal, observation: Observation): Promise<ProposalValidation>;
    waitSchema?(observation: Observation): Promise<Data | undefined>;
    validateWait?(basis: Data, observation: Observation): Promise<ProposalValidation>;
    actionContracts?(observation: Observation): Promise<ActionContract[]>;
    packObservation?(observation: Observation, byteLimit: number): Observation;
  };
}
