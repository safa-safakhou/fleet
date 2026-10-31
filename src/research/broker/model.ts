import { z } from "zod";

const JsonObject = z.record(z.string(), z.unknown());
export const ModelRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({ role: z.enum(["system", "user", "assistant", "tool"]), content: z.string().max(1048576) }).strict(),
      )
      .min(1)
      .max(500),
    schema: JsonObject,
    maxOutputTokens: z.number().int().min(1).max(16384),
    purpose: z.enum(["decision", "helper", "correction"]),
  })
  .strict();
export type ResearchModelRequest = z.infer<typeof ModelRequestSchema>;
export const GameQuerySchema = z.object({ tool: z.string().min(1).max(200), arguments: JsonObject }).strict();
export const ProposalSchema = z
  .object({
    kind: z.enum(["read", "action", "wait", "advisory"]),
    payload: JsonObject,
    sourceRefs: z.array(z.string().min(1).max(2000)).max(1000),
    preconditions: JsonObject,
  })
  .strict();
export type DecisionProposal = z.infer<typeof ProposalSchema>;
