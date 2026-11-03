import { z } from "zod";

const sample = z.object({
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  profile: z.string().min(1).max(200),
  bindingId: z.string().min(1).max(200),
  phases: z.array(z.string().min(1).max(100)).max(32),
  capacity: z.number().int().min(1).max(8),
  settled: z.boolean(),
  outcome: z.enum(["complete", "deferred", "failed"]),
  usageKnown: z.boolean(),
  evidenceComplete: z.boolean(),
  elapsedMs: z.number().finite().nonnegative(),
  turnLimitMs: z.number().int().positive().max(360000),
  longestCallMs: z.number().finite().nonnegative(),
  callLimitMs: z.number().int().positive().max(180000),
});
const qualification = z.object({
  scope: z.string().regex(/^[a-f0-9]{64}$/),
  current: z.number().int().min(1).max(8),
  next: z.number().int().min(1).max(8),
  requirements: z
    .array(
      z.object({ profile: z.string().min(1).max(200), phases: z.array(z.string().min(1).max(100)).min(1).max(32) }),
    )
    .min(1)
    .max(32),
  samples: z.array(sample).max(1000),
  memoryAvailability: z.number().min(0).max(100),
  providerWaiting: z.number().int().nonnegative(),
  preemptions: z.number().int().nonnegative(),
});
/** Approval for a bounded higher-capacity trial, never a claim that unmeasured capacity is qualified. */
export function canPromoteCapacity(raw: unknown): boolean {
  const parsed = qualification.safeParse(raw);
  if (!parsed.success) return false;
  const x = parsed.data;
  if (
    x.next !== x.current * 2 ||
    x.memoryAvailability < 30 ||
    x.providerWaiting !== 0 ||
    x.preemptions !== 0 ||
    new Set(x.requirements.map((r) => r.profile)).size !== x.requirements.length
  )
    return false;
  // Never cherry-pick successful replicas around adverse outcomes in this exact trial scope.
  if (
    x.samples.some(
      (s) =>
        s.scope === x.scope &&
        s.capacity === x.current &&
        x.requirements.some((r) => r.profile === s.profile) &&
        (!s.settled ||
          s.outcome !== "complete" ||
          !s.usageKnown ||
          !s.evidenceComplete ||
          s.elapsedMs * (x.next / x.current) >= s.turnLimitMs - 10000 ||
          s.longestCallMs * (x.next / x.current) >= s.callLimitMs - 1000),
    )
  )
    return false;
  return x.requirements.every((required) => {
    const distinct = new Set(
      x.samples
        .filter(
          (s) =>
            s.scope === x.scope &&
            s.profile === required.profile &&
            s.capacity === x.current &&
            s.settled &&
            s.outcome === "complete" &&
            s.usageKnown &&
            s.evidenceComplete &&
            s.elapsedMs * (x.next / x.current) < s.turnLimitMs - 10000 &&
            s.longestCallMs * (x.next / x.current) < s.callLimitMs - 1000 &&
            required.phases.every((p) => s.phases.includes(p)),
        )
        .map((s) => s.bindingId),
    );
    return distinct.size >= 2;
  });
}
/** Known completed refusals may get new sources, never a reset/replay of their completed task. */
export function settledTurnDisposition(x: {
  state: string;
  ownerPhase: string;
  taskState?: string;
  pendingCommand: string | null;
  unknownUsage: boolean;
  code: string | null;
}): "completed" | "completed_deferral" | "review" {
  if (x.state !== "finished" || x.pendingCommand !== null || x.unknownUsage) return "review";
  if (x.ownerPhase === "waiting" && x.taskState === "waiting" && x.code === "WAIT") return "completed";
  if (x.ownerPhase !== "completed" || (x.taskState !== undefined && x.taskState !== "completed")) return "review";
  if (["MODEL_ADMISSION_DEFERRED", "BUDGET_EXHAUSTED"].includes(x.code ?? "")) return "completed_deferral";
  return ["WAIT", "COMMITTED", "ALREADY_COMMITTED", "TURN_ACTION_LIMIT"].includes(x.code ?? "")
    ? "completed"
    : "review";
}
