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
};
export type ActionIntent = {
  commandId: string;
  bindingId: string;
  schemaId: string;
  expectedVersion?: string;
  payload: Data;
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
};
export type CapabilityRequirements = {
  eventDelivery?: ("native" | "poll")[];
  timing?: ("turn" | "realtime")[];
  nativeIdempotency?: boolean;
  outcomeLookup?: boolean;
  parallelReasoning?: boolean;
  social?: boolean;
  simulationControls?: boolean;
};
export type SchemaRequirements = { observations?: string[]; actions?: string[] };
export interface EnvironmentSession {
  observe(query: Data): Promise<Observation>;
  catalog(): Promise<Tool[]>;
  execute(intent: ActionIntent): Promise<ActionOutcome>;
  resolve(commandId: string): Promise<ActionOutcome>;
  events?(cursor: string | null): Promise<EventPage>;
  close(): Promise<void>;
}
export interface EnvironmentAdapter {
  ref: { id: string; version: string };
  schemas: { observations: string[]; actions: string[] };
  presentation: { accountLabel: string; actorLabel: string; entityLabel: string; defaultGoal: string };
  enrollment?: { attachExisting(agentId: string): Promise<BindingRef> };
  capabilities: Capabilities;
  connect(binding: BindingRef): Promise<EnvironmentSession>;
}
