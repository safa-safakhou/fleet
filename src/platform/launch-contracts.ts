import { z } from "zod";
import { Budget, ModelConfig } from "../domain.js";
import { ArchitectureRefSchema } from "./architecture-schema.js";
import { WakePolicySchema } from "./event-intake.js";
export const WorkLimitsSchema = z
  .object({
    reads: z.number().int().nonnegative(),
    actions: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    steps: z.number().int().positive(),
    wallTimeMs: z.number().int().positive(),
  })
  .strict();
export const LaunchSpecSchema = z
  .object({
    architecture: ArchitectureRefSchema,
    environment: ArchitectureRefSchema.extend({ instanceId: z.string().min(1).max(2000) }).strict(),
    preset: z.string().min(1).max(100).optional(),
    architectureConfig: z.record(z.string(), z.unknown()),
    model: ModelConfig,
    budget: Budget,
    wakePolicy: WakePolicySchema.optional(),
    accounts: z
      .object({
        agentIds: z
          .array(z.uuid())
          .min(1)
          .max(1000)
          .refine((a) => new Set(a).size === a.length, "Duplicate accounts"),
      })
      .strict(),
    nonModelLimits: WorkLimitsSchema.optional(),
  })
  .strict();
export type LaunchSpec = z.infer<typeof LaunchSpecSchema>;
export type LaunchCheck = {
  valid: boolean;
  ready: boolean;
  digest: string;
  checks: {
    area: "configuration" | "environment" | "credentials" | "provider" | "qualification" | "allowance" | "execution";
    status: "pass" | "fail" | "unknown";
    code: string;
    detail: string;
  }[];
};
export const LaunchDraftRequest = z.object({ requestId: z.uuid(), spec: LaunchSpecSchema }).strict();
export const LaunchUpdateRequest = z
  .object({ draftId: z.uuid(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/), spec: LaunchSpecSchema })
  .strict();
export const LaunchStartRequest = z
  .object({ requestId: z.uuid(), draftId: z.uuid(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
