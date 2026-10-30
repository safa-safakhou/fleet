import { z } from "zod";
import { ArtifactSchema, CoverageSchema, Decimal, ScopeSchema } from "../contracts.js";
export const EventKinds = [
  "run.started",
  "run.finished",
  "task.received",
  "task.state",
  "queue.enter",
  "queue.leave",
  "model.request",
  "model.dispatched",
  "model.response",
  "model.failed",
  "usage.settled",
  "usage.late",
  "game.read.request",
  "game.read.response",
  "command.prepared",
  "command.dispatched",
  "command.result",
  "command.receipt",
  "memory.read",
  "memory.write",
  "context.prepared",
  "policy.transition",
  "skill.invoked",
  "participant.message",
  "decision.proposed",
  "validation.result",
  "checkpoint.saved",
  "evaluation.result",
  "observation.record",
  "recording.gap",
] as const;
const id = z.string().min(1).max(2000),
  counter = Decimal.optional();
export const SafeAttributes = z
  .object({
    allocationId: z.uuid().optional(),
    commandId: z.uuid().optional(),
    turnId: z.uuid().optional(),
    sourceId: z.uuid().optional(),
    stage: z.enum(["observing", "ready", "thinking", "deciding", "reading", "acting", "result", "finished"]).optional(),
    code: z
      .string()
      .regex(/^[A-Z0-9_.:-]{1,100}$/)
      .optional(),
    purpose: z
      .enum(["decision", "correction", "helper", "optimizer", "judge", "embedding", "observation", "execution"])
      .optional(),
    outcome: z.enum(["ok", "error", "pending", "unknown", "not_dispatched", "withheld", "expired"]).optional(),
    bytes: counter,
    queueDelayMs: counter,
    durationMs: counter,
    inputTokens: counter,
    outputTokens: counter,
    count: counter,
  })
  .strict();
export const EventInputSchema = z
  .object({
    producerKey: z.string().min(1).max(200),
    streamId: z.string().regex(/^[a-zA-Z0-9_.:@/-]{1,120}$/),
    kind: z.enum(EventKinds),
    occurredAt: z.iso.datetime().optional(),
    parentIds: z.array(z.uuid()).max(100).default([]),
    processId: id.optional(),
    monotonicNs: Decimal.optional(),
    durationNs: Decimal.optional(),
    gameClockId: id.optional(),
    gameTime: id.optional(),
    attributes: SafeAttributes.default({}),
    artifacts: z.array(ArtifactSchema).max(10000).default([]),
    coverage: CoverageSchema.default({ status: "complete", expected: "1", recorded: "1", reasons: [] }),
  })
  .strict();
export type EvidenceEventInput = z.input<typeof EventInputSchema>;
export const EventSchema = EventInputSchema.omit({ producerKey: true }).extend({
  schemaVersion: z.literal("fleet.evidence/v1"),
  id: z.uuid(),
  scope: ScopeSchema,
  sequence: Decimal,
  ordinal: Decimal,
  occurredAt: z.iso.datetime(),
  recordedAt: z.iso.datetime(),
});
export type EvidenceEvent = z.infer<typeof EventSchema>;
export type EventRef = { id: string; streamId: string; sequence: string };
export const PageQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(500).default(200),
    after: Decimal.optional(),
    maximumOrdinal: Decimal.optional(),
    kind: z.enum(EventKinds).optional(),
    streamId: z.string().max(120).optional(),
  })
  .strict();
export type EventPageQuery = z.input<typeof PageQuerySchema>;
export type EventPage = {
  events: EvidenceEvent[];
  total: number;
  hasMore: boolean;
  nextAfter: string | null;
  maximumOrdinal: string;
};
export type CompletenessManifest = {
  version: "fleet.coverage/v1";
  runId: string;
  status: "complete" | "partial" | "unavailable" | "withheld" | "expired";
  expected: number;
  recorded: number;
  missing: { kind: string; sourceId: string }[];
  eventCount: number;
  byteCoverage: { expected: string; recorded: string; status: string };
  reasons: string[];
};
