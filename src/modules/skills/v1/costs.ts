import type { z } from "zod";
import type { WorkLimitsSchema } from "../../../platform/launch-contracts.js";
import type { Invocation } from "./checkpoints.js";
export type WorkLimits = z.infer<typeof WorkLimitsSchema>;
export type WorkKind = keyof WorkLimits;
export interface WorkLedger {
  limits(recipe: WorkLimits, requested?: Partial<WorkLimits>): Promise<WorkLimits>;
  reserve(invocation: Invocation, nodeId: string, work: Partial<WorkLimits>): Promise<void>;
  consume(invocation: Invocation, nodeId: string, kind: WorkKind, units: number): Promise<void>;
  meterWall(invocation: Invocation, enforce: boolean): Promise<void>;
  recordRecovery(invocation: Invocation, nodeId: string, eventId: string): Promise<void>;
}
export const workKinds = ["reads", "actions", "messages", "steps", "wallTimeMs"] as const;
export function minimumWorkLimits(...limits: WorkLimits[]): WorkLimits {
  return Object.fromEntries(workKinds.map((k) => [k, Math.min(...limits.map((l) => l[k]))])) as WorkLimits;
}
