import { z } from "zod";
import { launchDigest } from "../../../platform/launch.js";
import { WorkLimitsSchema } from "../../../platform/launch-contracts.js";
export const SkillRefSchema = z
  .object({ id: z.uuid(), version: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type SkillRef = z.infer<typeof SkillRefSchema>;
export const SkillStatusSchema = z.enum(["candidate", "advisory", "guarded", "suspended", "retired"]);
export type SkillStatus = z.infer<typeof SkillStatusSchema>;
const ref = z.object({ id: z.string().min(1).max(100), version: z.string().min(1).max(40) }).strict(),
  data = z.record(z.string(), z.unknown());
export const RecipeNodeSchema = z.union([
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
      kind: z.enum(["observe", "check", "calculate", "request", "submit", "await", "verify"]),
      primitive: ref,
      args: data,
      saveAs: z
        .string()
        .regex(/^[a-z][a-z0-9_-]{0,39}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
      kind: z.literal("invoke"),
      skill: SkillRefSchema,
      args: data,
    })
    .strict(),
  z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
      kind: z.literal("return_to_reasoning"),
      reason: z.string().min(1).max(400),
    })
    .strict(),
]);
export type RecipeNode = z.infer<typeof RecipeNodeSchema>;
export const SkillCandidateSchema = z
  .object({
    parent: SkillRefSchema.optional(),
    representation: z.enum(["guide", "recipe"]),
    purpose: z
      .object({
        summary: z.string().min(1).max(500),
        goalKinds: z.array(z.string().min(1).max(100)).min(1).max(8),
        nonGoals: z.array(z.string().max(500)).max(16),
      })
      .strict(),
    compatibility: z
      .object({
        environment: ref,
        roles: z.array(z.string().min(1).max(64)).min(1).max(4),
        primitives: z.array(ref).max(32),
        actionKeys: z.array(z.string().min(1).max(100)).max(8),
      })
      .strict(),
    inputs: data,
    applicability: z
      .object({
        goalKind: z.string().min(1).max(100),
        maxAgeMs: z.number().int().min(1).max(86400000),
        requiredSourceKinds: z.array(z.enum(["observation", "outcome", "promise"])).max(3),
        conditions: z.array(z.object({ primitive: ref, args: data }).strict()).max(16),
        exclusions: z.array(z.string().max(400)).max(16),
      })
      .strict(),
    procedure: z
      .object({
        guide: z.string().max(4000),
        nodes: z.array(RecipeNodeSchema).max(32),
        children: z.array(SkillRefSchema).max(4),
        template: z.string().max(100).optional(),
      })
      .strict(),
    completion: z
      .object({
        description: z.string().min(1).max(1000),
        assessmentMs: z
          .number()
          .int()
          .positive()
          .max(7 * 86400000),
      })
      .strict(),
    interruption: z
      .object({ abortWhen: z.array(z.string().max(400)).min(1).max(16), onUnknown: z.literal("return_to_reasoning") })
      .strict(),
    effects: z.object({ actionKeys: z.array(z.string().min(1).max(100)).max(8), resourceNeeds: data }).strict(),
    limits: WorkLimitsSchema.extend({ modelCalls: z.literal(0) }).strict(),
    evidence: z
      .object({
        sourceIds: z.array(z.uuid()).min(1).max(32),
        episodeIds: z.array(z.string().min(1).max(200)).min(1).max(16),
        claimedOutcome: z.enum(["unproven", "success", "failure"]),
      })
      .strict(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (Buffer.byteLength(JSON.stringify(v)) > 32000) ctx.addIssue({ code: "custom", message: "Skill body limit" });
    if (v.inputs.type !== "object" || v.inputs.additionalProperties !== false)
      ctx.addIssue({ code: "custom", message: "Closed typed object inputs required" });
    const defaults = (x: unknown): boolean =>
      Array.isArray(x)
        ? x.some(defaults)
        : !!x && typeof x === "object" && (Object.hasOwn(x, "default") || Object.values(x).some(defaults));
    if (defaults(v.inputs)) ctx.addIssue({ code: "custom", message: "Historical defaults are not reusable inputs" });
    if (
      (v.representation === "guide" && v.procedure.nodes.length) ||
      (v.representation === "recipe" && !v.procedure.nodes.length)
    )
      ctx.addIssue({ code: "custom", message: "Representation/procedure mismatch" });
  });
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;
export type SkillVersion = {
  ref: SkillRef;
  author: string;
  body: SkillCandidate;
  status: SkillStatus;
  evaluationId?: string;
  published: boolean;
  createdAt: string;
  outcomeSupport: "unproven" | "observed_success" | "observed_failure";
};
export type SkillSummary = Pick<SkillVersion, "ref" | "author" | "status" | "published" | "outcomeSupport"> & {
  purpose: string;
  goalKinds: string[];
  environment: { id: string; version: string };
  roles: string[];
  actionKeys: string[];
  representation: "guide" | "recipe";
};
export function skillContentDigest(body: unknown) {
  return launchDigest(SkillCandidateSchema.parse(body));
}
