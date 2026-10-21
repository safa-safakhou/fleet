import { z } from "zod";
export const SpecialistScopeSchema = z
  .object({
    instanceId: z.string().min(1).max(2000),
    bindingId: z.uuid(),
    specialistId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  })
  .strict();
export type SpecialistScope = z.infer<typeof SpecialistScopeSchema>;
export const CharterSchema = z
  .object({
    id: SpecialistScopeSchema.shape.specialistId,
    revision: z.number().int().positive(),
    responsibility: z.string().min(1).max(4000),
    priority: z.number().int().min(0).max(100),
    allowedActions: z.array(z.string().min(1).max(100)).max(100),
    maxActiveGoals: z.number().int().min(1).max(8),
  })
  .strict();
export type SpecialistCharter = z.infer<typeof CharterSchema>;
export const SpecialistPresetSchema = z
  .object({
    id: z.string().min(1).max(100),
    roles: z
      .array(
        z
          .object({
            charter: CharterSchema,
            subscriptions: z
              .object({
                categories: z.array(z.string().min(1).max(64)).max(32),
                periodic: z.boolean(),
                version: z.string().min(1).max(40),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
export type SpecialistPreset = z.infer<typeof SpecialistPresetSchema>;
const evidenceIds = z
  .array(z.uuid())
  .min(1)
  .max(32)
  .refine((v) => new Set(v).size === v.length, "Duplicate support");
export const SpecialistGoalSchema = z
  .object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    objective: z.string().min(1).max(1000),
    rationale: z.string().min(1).max(2000),
    status: z.enum(["active", "suspended", "completed", "abandoned"]),
    evidenceIds,
    assessment: z.string().min(1).max(1000),
    assessmentCondition: z
      .object({
        name: z.string().min(1).max(100),
        version: z.string().min(1).max(40),
        args: z.record(z.string(), z.unknown()),
      })
      .strict()
      .optional(),
    wake: z.string().min(1).max(1000),
  })
  .strict();
export type SpecialistGoal = z.infer<typeof SpecialistGoalSchema>;
export const SpecialistMemorySchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["interpretation", "prediction", "plan"]),
    text: z.string().min(1).max(2000),
    evidenceIds,
    uncertainty: z.string().min(1).max(1000),
  })
  .strict();
export type SpecialistMemory = z.infer<typeof SpecialistMemorySchema>;
export const SpecialistEnvelopeSchema = z
  .object({
    goals: z.array(SpecialistGoalSchema).max(32),
    memories: z.array(SpecialistMemorySchema).max(32),
    predictions: z.array(SpecialistMemorySchema).max(32),
    plan: z.string().max(4000).nullable(),
    deliveryIds: z.array(z.uuid()).max(100),
    messages: z.array(z.record(z.string(), z.unknown())).max(8),
    wakeConditions: z.array(z.record(z.string(), z.unknown())).max(8),
    intent: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type SpecialistEnvelope = z.infer<typeof SpecialistEnvelopeSchema>;
export type SpecialistState = {
  version: number;
  charterVersion: number;
  charter: SpecialistCharter;
  goals: SpecialistGoal[];
  memories: SpecialistMemory[];
  predictions: SpecialistMemory[];
  plan: string | null;
  coverage: { complete: boolean; omittedGoals: number; omittedMemories: number; reason?: string };
};
export interface ParticipantStatePort {
  load(specialistId: string): Promise<SpecialistState>;
  accept(
    specialistId: string,
    input: { expectedVersion: number; operationId: string; envelope: unknown },
  ): Promise<{ version: number; accepted: boolean }>;
}
