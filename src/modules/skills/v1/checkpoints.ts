import { createHash } from "node:crypto";
import type { Data } from "../../../domain.js";
import type { SpecialistScope } from "../../../platform/participant-state.js";
import type { WorkLimits } from "./costs.js";
import type { SkillRef } from "./schema.js";
export type ExistingSkillGoal = {
  id: string;
  kind: string;
  parameters: Data;
  revision: string;
  ownerRevision: string;
  active: boolean;
  allowedActions: string[];
};
export type Invocation = {
  id: string;
  scope: SpecialistScope;
  skillRef: SkillRef;
  goalId: string;
  triggerId: string;
  state: "active" | "waiting" | "completed" | "reason" | "unknown";
  revision: number;
  nodeIndex: number;
  effectiveLimits: WorkLimits;
  startedAt: string;
  inputs: Data;
  values: Data;
  goalRevision: string;
  ownerRevision: string;
  reason: string | null;
  privateUnavailable?: boolean;
};
export type Checkpoint = {
  invocationId: string;
  nodeId: string;
  revision: number;
  state: "prepared" | "started" | "waiting" | "completed" | "unknown";
  commandId?: string;
  result?: Data;
  payloadDigest?: string;
};
export interface InvocationRepository {
  forGoal(goalId: string, ref: SkillRef): Promise<Invocation | undefined>;
  start(
    scope: SpecialistScope,
    input: { skillRef: SkillRef; goal: ExistingSkillGoal; inputs: Data; triggerId: string; limits: WorkLimits },
  ): Promise<Invocation>;
  load(id: string): Promise<Invocation>;
  acceptEvent(id: string, eventId: string): Promise<boolean>;
  checkpoint(invocation: Invocation, nodeId: string, commandId?: string): Promise<Checkpoint>;
  outstanding(id: string): Promise<Checkpoint | undefined>;
  begin(checkpoint: Checkpoint): Promise<boolean>;
  resetUnstarted(checkpoint: Checkpoint): Promise<boolean>;
  submission(checkpoint: Checkpoint, payload: Data): Promise<void>;
  finish(
    invocation: Invocation,
    checkpoint: Checkpoint | null,
    update: { state: Invocation["state"]; nodeIndex: number; values: Data; reason?: string; result?: Data },
  ): Promise<Invocation>;
}
export function skillCommandId(invocationId: string, nodeId: string) {
  const h = createHash("sha256")
    .update(JSON.stringify([invocationId, nodeId]))
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
