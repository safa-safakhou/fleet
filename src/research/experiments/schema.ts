import { z } from "zod";
import { EvaluatorSpecSchema } from "../evaluation/pact.js";
import { WindowSchema } from "../metrics/types.js";

const ID = z.string().regex(/^[a-zA-Z0-9_.:@/-]{1,200}$/),
  Hash = z.string().regex(/^[a-f0-9]{64}$/),
  Decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const ExperimentSpecSchema = z
  .object({
    schemaVersion: z.literal("fleet.experiment/v1"),
    id: z.uuid(),
    assignmentUnit: z.enum(["world", "session"]),
    baseline: ID,
    primaryMetric: ID,
    secondaryMetrics: z.array(ID).max(30),
    margin: z.number().finite().nonnegative(),
    window: WindowSchema,
    evaluator: EvaluatorSpecSchema.optional(),
    horizonMs: z.number().int().positive(),
    seed: z.number().int(),
    paired: z.boolean(),
    stoppingRule: z.literal("fixed-horizon"),
    missingness: z.literal("report-and-block-inference"),
    splitDigests: z.object({ train: Hash, development: Hash, heldout: Hash }).strict(),
    units: z
      .array(
        z
          .object({
            id: ID,
            arm: ID,
            worldId: ID,
            sessionId: ID,
            pairId: ID.optional(),
            cohortId: z.uuid(),
            runIds: z.array(ID).min(1).max(100),
            manifestDigest: Hash,
            limits: z.object({ calls: Decimal, tokens: Decimal, concurrency: z.number().int().positive() }).strict(),
          })
          .strict(),
      )
      .min(2)
      .max(200),
  })
  .strict()
  .superRefine((s, c) => {
    if (
      Date.parse(s.window.end) - Date.parse(s.window.start) !== s.horizonMs ||
      (s.evaluator && JSON.stringify(s.evaluator.window) !== JSON.stringify(s.window)) ||
      new Set(s.secondaryMetrics).size !== s.secondaryMetrics.length ||
      s.secondaryMetrics.includes(s.primaryMetric) ||
      new Set(s.units.map((u) => u.arm)).size < 2 ||
      new Set(s.units.map((u) => u.id)).size !== s.units.length ||
      new Set(s.units.flatMap((u) => u.runIds)).size !== s.units.flatMap((u) => u.runIds).length ||
      !s.units.some((u) => u.arm === s.baseline) ||
      new Set(Object.values(s.splitDigests)).size !== 3 ||
      (s.paired && s.units.some((u) => !u.pairId))
    )
      c.addIssue({ code: "custom", message: "Invalid predeclared assignment or split" });
  });
export type ExperimentSpec = z.input<typeof ExperimentSpecSchema>;
