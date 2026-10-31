import { z } from "zod";
import { FleetError } from "../../domain.js";
import { digest, type RunScope } from "../contracts.js";
import type { RunManifestInput } from "../manifests/compiler.js";
export const SourceClassSchema = z.enum([
  "owner-guidance",
  "observation",
  "peer-statement",
  "inference",
  "command-admitted",
  "confirmed-outcome",
  "feedback",
  "skill",
  "working-state",
]);
export type SourceClass = z.infer<typeof SourceClassSchema>;
const Fields = z
  .object({
    kind: z.enum(["episode", "belief", "plan", "reflection", "skill", "working-state"]),
    sourceClass: SourceClassSchema,
    text: z.string().min(1).max(262144),
    sourceRefs: z.array(z.string().min(1)).min(1).max(100),
    observedAt: z.iso.datetime(),
    effectiveAt: z.object({ clockId: z.string(), value: z.string() }).strict().optional(),
    contradicts: z.array(z.uuid()).max(100).default([]),
    importance: z.number().min(0).max(1).default(0),
    privacy: z.literal("private"),
    indexPolicyId: z.string().optional(),
  })
  .strict();
export const MemoryInputSchema = Fields.refine(
  (x) => !["belief", "reflection"].includes(x.kind) || x.sourceClass === "inference",
  "Beliefs/reflections retain inference class",
);
export const MemoryUpdateSchema = Fields.pick({
  text: true,
  sourceRefs: true,
  observedAt: true,
  effectiveAt: true,
  contradicts: true,
  importance: true,
})
  .partial()
  .strict();
export type MemoryInput = z.input<typeof MemoryInputSchema>;
export type MemoryRef = { id: string; version: string };
export type MemoryRecord = MemoryRef & z.output<typeof MemoryInputSchema> & { namespace: string; expiresAt: string };
export function namespaceFor(scope: Pick<RunScope, "agentId" | "bindingId" | "participantId">, m: RunManifestInput) {
  return digest({
    version: "memory-index@1",
    world: m.environment.worldIncarnation,
    agent: scope.agentId,
    binding: scope.bindingId,
    participant: scope.participantId ?? null,
    profile: m.profile,
    namespace: m.memory.namespace,
    component: m.components.memory ?? "typed-memory@1",
    language: m.retrieval.language,
    embedding: m.memory.embedding ?? null,
  });
}
export function textConfiguration(language: string) {
  if (language === "en") return "english";
  if (language === "simple") return "simple";
  throw new FleetError("LANGUAGE_UNSUPPORTED", true);
}
