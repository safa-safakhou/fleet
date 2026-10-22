import type { BudgetConfig, Data, ModelPort, ModelSettings, Tool } from "../domain.js";
import type { ArchitectureRef } from "./architecture.js";

export type { ActionEffects } from "./action-effects.js";
export type {
  ParticipantStatePort,
  SpecialistCharter,
  SpecialistEnvelope,
  SpecialistGoal,
  SpecialistMemory,
  SpecialistScope,
  SpecialistState,
} from "./participant-state.js";
export { SpecialistEnvelopeSchema, SpecialistGoalSchema, SpecialistMemorySchema } from "./participant-state.js";
export { compareDomainTime, WakeConditionSchema } from "./wake-conditions.js";

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
  skills?: {
    tryKnownGoal?(): Promise<{ handled: boolean; state?: string; reason?: string }>;
    canLearn(): Promise<boolean>;
    retrieve(query: {
      goal: string;
      event: string;
      limit: number;
    }): Promise<import("../modules/skills/v1/schema.js").SkillSummary[]>;
    loadSelected(
      refs: import("../modules/skills/v1/schema.js").SkillRef[],
    ): Promise<import("../modules/skills/v1/schema.js").SkillVersion[]>;
    propose(
      candidates: import("../modules/skills/v1/schema.js").SkillCandidate[],
    ): Promise<import("../modules/skills/v1/schema.js").SkillRef[]>;
    publish(ref: import("../modules/skills/v1/schema.js").SkillRef): Promise<void>;
    adopt(ref: import("../modules/skills/v1/schema.js").SkillRef): Promise<void>;
  };
  participants?: {
    load(): Promise<import("./participant-state.js").SpecialistState>;
    inbox(): Promise<{
      records: { id: string; event: EnvironmentEvent | null; rootId: string; depth: number }[];
      omitted: number;
    }>;
    captureOriginal(
      input: Omit<
        import("../modules/evidence/negotiation/v1.js").Original,
        "id" | "bindingId" | "createdAt" | "expiresAt"
      >,
    ): Promise<import("../modules/evidence/negotiation/v1.js").Original>;
    originals(requiredIds?: string[]): Promise<import("../modules/evidence/negotiation/v1.js").Original[]>;
    coordination(): Promise<Data>;
    accept(input: {
      expectedVersion: number;
      envelope: Omit<import("./participant-state.js").SpecialistEnvelope, "intent">;
      intent?: ActionIntent;
      defer?: boolean;
    }): Promise<{ version: number; accepted: boolean; outcome?: ActionOutcome }>;
  };
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
    specialistObservationPolicy?: { id: string; version: string };
    skillTemplates?: Data[];
    capabilities: Capabilities;
    schemas: { observations: string[]; actions: string[] };
    specialistPresets?: import("./participant-state.js").SpecialistPreset[];
    observationSemantics?: string;
    conditionContracts?: import("./contracts.js").ConditionContract[];
    accountObjective?(observation: Observation): AccountObjective | undefined;
    catalog(): Promise<Tool[]>;
    readQuerySchema?(): Promise<Data>;
    validateProposal?(proposal: Proposal, observation: Observation): Promise<ProposalValidation>;
    waitSchema?(observation: Observation): Promise<Data | undefined>;
    validateWait?(basis: Data, observation: Observation): Promise<ProposalValidation>;
    actionContracts?(observation: Observation, allowedActionKeys?: readonly string[]): Promise<ActionContract[]>;
    projectObservation?(observation: Observation, policy: { id: string; version: string }): Observation;
    packObservation?(observation: Observation, byteLimit: number): Observation;
  };
}
