import type { Data, Tool } from "../domain.js";
export type OutcomeStatus = "confirmed" | "rejected" | "pending" | "unknown";
export type DomainTime = { clockId: string; value: string };
export type EnvironmentRef = { id: string; version: string; instanceId: string };
export type BindingRef = {
  id: string;
  environment: EnvironmentRef;
  accountRef: string;
  actorRef: string;
  entityRef: string;
};
export type Observation = {
  schemaId: string;
  revision: string;
  observedAt: string;
  environmentTime: DomainTime;
  sourceRefs: string[];
  payload: Data;
  coverage: Data;
  continuity?: ContinuityObservation;
  coordination?: CoordinationFrame;
};
export type ActionIntent = {
  commandId: string;
  bindingId: string;
  schemaId: string;
  expectedVersion?: string;
  payload: Data;
  guard?: {
    schemaVersion: "fleet.action-effects-guard.v1";
    expectedRevision: string;
    expectedEffects: import("./action-effects.js").ActionEffects;
  };
};
export type ActionOutcome = { commandId: string; status: OutcomeStatus; code: string; sourceRefs: string[] };
export type EnvironmentEvent = {
  id: string;
  type: string;
  sourceRef: string;
  observedAt: string;
  environmentTime: DomainTime;
  deadline?: DomainTime;
  metadata: Data;
};
export type EventPage = {
  events: EnvironmentEvent[];
  nextCursor: string | null;
  resyncRequired: boolean;
  fromCursor?: string | null;
  resumeFrom?: string;
};
export type Capabilities = {
  timing: "turn" | "realtime";
  events: "native" | "poll" | "none";
  idempotency: "native" | "none";
  outcomeLookup: boolean;
  parallelReasoning: boolean;
  social: boolean;
  simulationControls: boolean;
  continuity?: boolean;
  coordination?: boolean;
  actionEffects?: boolean;
};
export type CapabilityRequirements = {
  eventDelivery?: ("native" | "poll")[];
  timing?: ("turn" | "realtime")[];
  nativeIdempotency?: boolean;
  outcomeLookup?: boolean;
  parallelReasoning?: boolean;
  social?: boolean;
  simulationControls?: boolean;
  continuity?: boolean;
  coordination?: boolean;
  actionEffects?: boolean;
};
export type SchemaRequirements = { observations?: string[]; actions?: string[] };
export type AccountObjective = string | { intent: string; currentState: Data };
export type ActionContract = { schemaId: string; payloadSchema: Data; expectedOutcomeSchema?: Data };
export type ProposalValidation = { valid: boolean; code: string; guidance?: string; detail?: Data };
export interface EnvironmentSession {
  effects?(intent: ActionIntent): Promise<import("./action-effects.js").ActionEffects>;
  observe(query: Data): Promise<Observation>;
  catalog(): Promise<Tool[]>;
  execute(intent: ActionIntent): Promise<ActionOutcome>;
  resolve(commandId: string): Promise<ActionOutcome>;
  events?(cursor: string | null): Promise<EventPage>;
  validateProposal?(proposal: Proposal, observation: Observation): Promise<ProposalValidation>;
  waitSchema?(observation: Observation): Promise<Data | undefined>;
  validateWait?(basis: Data, observation: Observation): Promise<ProposalValidation>;
  actionContracts?(observation: Observation): Promise<ActionContract[]>;
  projectObservation?(observation: Observation, policy: { id: string; version: string }): Observation;
  packObservation?(observation: Observation, byteLimit: number): Observation;
  close(): Promise<void>;
}
export interface EnvironmentAdapter {
  instructions?: string;
  accountObjective?(observation: Observation): AccountObjective | undefined;
  ref: { id: string; version: string };
  schemas: { observations: string[]; actions: string[] };
  presentation: { accountLabel: string; actorLabel: string; entityLabel: string; defaultGoal: string };
  enrollment?: { attachExisting(agentId: string): Promise<BindingRef> };
  capabilities: Capabilities;
  connect(binding: BindingRef): Promise<EnvironmentSession>;
}

export type ContinuityFact = {
  sourceRef: string;
  kind: "state" | "statement" | "commitment" | "outcome";
  subject: string;
  predicate: string;
  value: string;
  occurredAt?: DomainTime;
};
export type ContinuityObservation = {
  schemaVersion: "fleet.continuity-observation.v1";
  self: { capabilities: string[]; needs: Data; dependencies: Data; ownerValues: Data };
  facts: ContinuityFact[];
};

export type StructuredClaim = { schemaId: string; key: string } & (
  | { kind: "resource" | "authority"; units: string }
  | { kind: "promise"; value: string }
);
export type Proposal = {
  taskId: string;
  intent: ActionIntent;
  evidenceRefs: string[];
  expectedOutcome: Data;
  claims: StructuredClaim[];
  conflicts: string[];
  validUntil?: DomainTime;
};
export type CoordinationFrame = {
  schemaVersion: "fleet.coordination.v1";
  atomicExpectedVersion: true;
  claimSchemas: { id: string; kind: "resource" | "authority" | "promise" }[];
  capacities: { schemaId: string; key: string; remainingUnits: string }[];
  promises: { schemaId: string; key: string; value: string }[];
  focuses: { id: string; sourceRefs: string[]; observation: Data }[];
  ownerPriorities: Data;
  coverage: Data;
};
