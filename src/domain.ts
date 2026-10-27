import { createHash } from "node:crypto";
import { z } from "zod";

export type Data = Record<string, unknown>;
export const object = (v: unknown): Data => (v && typeof v === "object" && !Array.isArray(v) ? (v as Data) : {});
export const profiles = {
  guardian: "Preserve your position, reliable supplies and valuable alliances. Accept less downside risk.",
  expansionist:
    "Seek territory and influence. Accept greater resource and military risk when the advantage warrants it.",
  merchant:
    "Increase economic resilience and find advantageous trading opportunities. Assess obligations and partners.",
  diplomat: "Build useful relationships, institutions and influence. Evaluate alliances and competing commitments.",
  opportunist: "Seek situational advantage and flexibility. Reconsider commitments when circumstances change.",
} as const;
export type Profile = keyof typeof profiles;
export const profileNames = Object.keys(profiles) as Profile[];
export const Draft = z
  .object({
    name: z.string().trim().min(2).max(80),
    count: z.number().int().min(1).max(1000),
    intervalMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]),
    seed: z.string().min(1).max(80),
    strategies: z.array(z.enum(profileNames)).min(1).max(20),
  })
  .strict();
export const ModelConfig = z
  .object({
    route: z.enum(["ollama", "openai-compatible", "codex-cli"]),
    model: z.string().min(1).max(100),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    contextWindowTokens: z.number().int().min(512).max(1050000).optional(),
    thinking: z.boolean().optional(),
    provider: z.literal("vllm").optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().gt(0).max(1).optional(),
    seed: z.number().int().min(0).max(2147483647).optional(),
    decisionPolicy: z.enum(["vw-focus-v1"]).optional(),
    cognition: z.enum(["llm-centered-v1"]).optional(),
    recallAssist: z.enum(["laya-recall-v1"]).optional(),
  })
  .strict()
  .refine(
    (m) =>
      m.contextWindowTokens === undefined ||
      m.route === "codex-cli" ||
      (m.route === "openai-compatible" && m.provider === "vllm" && m.contextWindowTokens <= 262144),
    "Explicit context requires a supported provider",
  )
  .refine((m) => m.provider === undefined || m.route === "openai-compatible", "vLLM requires a compatible route")
  .refine(
    (m) => m.thinking === undefined || m.route === "ollama" || m.provider === "vllm",
    "Thinking selection requires an explicit supported provider",
  )
  .refine(
    (m) => m.route !== "codex-cli" || [m.temperature, m.topP, m.seed].every((v) => v === undefined),
    "Sampling selection requires an HTTP provider",
  )
  .refine((m) => !m.cognition || !m.decisionPolicy, "LLM-centered cognition does not use VW")
  .refine((m) => !m.recallAssist || m.cognition === "llm-centered-v1", "Recall assistance requires cognition");
const executionLimits = {
  perCallTokenLimit: z.number().int().min(100).max(2000000),
  maxOutputTokens: z.number().int().min(1).max(16384),
  inputByteLimit: z.number().int().min(500).max(1048576),
  maxCallsPerTurn: z.number().int().min(1).max(3),
  maxActionsPerTurn: z.number().int().min(1).max(3),
  concurrency: z.number().int().min(1).max(16),
  executionAccountingAccepted: z.literal(true).optional(),
};
export const Budget = z
  .discriminatedUnion("mode", [
    z
      .object({
        ...executionLimits,
        mode: z.enum(["finite", "daily"]),
        callLimit: z.number().int().min(1).max(1000000),
        tokenLimit: z.number().int().min(1).max(1000000000),
        deadlineAt: z.iso.datetime(),
      })
      .strict(),
    z
      .object({
        ...executionLimits,
        mode: z.literal("continuous"),
        callLimit: z.null(),
        tokenLimit: z.null(),
        deadlineAt: z.null(),
        continuousExecutionAccepted: z.literal(true),
      })
      .strict(),
  ])
  .refine(
    (b) => (b.perCallTokenLimit <= 40000 && b.inputByteLimit <= 64000) || b.executionAccountingAccepted === true,
    "Extended context requires explicit execution accounting",
  )
  .refine(
    (b) => (b.mode === "continuous" || b.tokenLimit >= b.perCallTokenLimit) && b.perCallTokenLimit > b.maxOutputTokens,
    "Budget must cover one complete call",
  );
export type BudgetConfig = z.infer<typeof Budget>;
export type ModelSettings = z.infer<typeof ModelConfig>;
export function supportsExtendedContextBudget(model: ModelSettings, budget: BudgetConfig): boolean {
  return (
    (budget.perCallTokenLimit <= 40000 && budget.inputByteLimit <= 64000) ||
    (model.route === "openai-compatible" &&
      model.provider === "vllm" &&
      (model.contextWindowTokens ?? 0) >= 32768 &&
      (model.contextWindowTokens ?? 0) <= 262144 &&
      budget.perCallTokenLimit >= (model.contextWindowTokens ?? Infinity) &&
      budget.executionAccountingAccepted === true) ||
    (model.route === "codex-cli" &&
      (model.contextWindowTokens ?? 0) >= 262144 &&
      budget.executionAccountingAccepted === true &&
      budget.concurrency === 1)
  );
}
export interface Strategy {
  profile: Profile;
  objective: string;
  riskTolerance: number;
  patience: number;
  horizon: string;
  version: number;
}
export function strategy(profile: Profile, seed: string): Strategy {
  const h = createHash("sha256").update(seed).digest();
  return {
    profile,
    objective: profiles[profile],
    riskTolerance:
      Math.round((profile === "guardian" ? 0.1 : profile === "expansionist" ? 0.6 : 0.3) * 100 + (h[0] % 25)) / 100,
    patience: 1 + (h[1] % 5),
    horizon: ["near term", "balanced", "long term"][h[2] % 3],
    version: 1,
  };
}
export function nextSlot(anchor: number, intervalMs: number, phaseMs: number, now: number): number {
  const first = anchor + phaseMs;
  return first > now ? first : first + (Math.floor((now - first) / intervalMs) + 1) * intervalMs;
}
export function safeCode(error: unknown): string {
  const e = object(error);
  for (const candidate of [e.code, e.message])
    if (typeof candidate === "string" && /^[A-Z][A-Z0-9_]{1,70}$/.test(candidate)) return candidate;
  return "TRANSPORT_UNCERTAIN";
}
export class FleetError extends Error {
  constructor(
    readonly code: string,
    readonly notDispatched = false,
  ) {
    super(code);
  }
}
/** Only preparation code may issue this: no accepted state/command survives the rejection. */
export class ProposalRejection extends FleetError {
  readonly feedback: { code: string; guidance: string; detail: Data };
  constructor(code: string, guidance: string, detail: Data = {}) {
    super(code, true);
    this.feedback = { code, guidance, detail };
  }
}

export const Decision = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("wait"),
      summary: z.string().max(400),
      notes: z.string().max(4000).optional(),
      basis: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("read"),
      tool: z.string().max(100),
      args: z.record(z.string(), z.unknown()),
      summary: z.string().max(400),
      notes: z.string().max(4000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("action"),
      action: z.object({ kind: z.string().min(1).max(100) }).catchall(z.unknown()),
      summary: z.string().max(400),
      notes: z.string().max(4000).optional(),
    })
    .strict(),
]);
export type DecisionValue = z.infer<typeof Decision>;
export const decisionSchema = z.toJSONSchema(Decision, { target: "draft-7" });
export interface Tool {
  name: string;
  description?: string;
  inputSchema: Data;
  annotations?: { readOnlyHint?: boolean };
  _meta?: Data;
}
export interface GamePort {
  profile(): Promise<{ accountId: string; entityId?: string }>;
  tools(): Promise<Tool[]>;
  read(tool: string, args: Data): Promise<Data>;
  open(): Promise<void>;
  submit(commandId: string, action: Data): Promise<Data>;
  effects?(command: Data): Promise<Data>;
  submitGuarded?(command: Data, guard: Data): Promise<Data>;
  receipt(commandId: string): Promise<Data>;
  close(): Promise<void>;
}
export interface ModelPort {
  contextWindow?(model: ModelSettings): number | undefined;
  readonly tracksDispatch?: boolean;
  estimateInputTokens?(input: {
    model: ModelSettings;
    messages: { role: string; content: string }[];
    maxOutputTokens?: number;
    signal: AbortSignal;
  }): Promise<number>;
  decide(input: {
    model: ModelSettings;
    messages: { role: string; content: string }[];
    schema: Data;
    /** Engine-owned envelope, independent of observation-bound generation values. Never sent as prompt authority. */
    outputContract?: Data;
    maxOutputTokens: number;
    signal: AbortSignal;
    onDispatch?: () => Promise<void>;
    decisionEvidence?: import("./platform/evidence-decision.js").DecisionEvidence;
  }): Promise<{
    decision: unknown;
    inputTokens: number | null;
    outputTokens: number | null;
    decisionError?: string;
    verifiedEvidence?: import("./platform/evidence-decision.js").VerifiedEvidenceDecision;
    outputText?: string;
    execution?: import("./model-progress.js").GenerationProgress;
    providerMetadata?: {
      protocol: "ollama.chat";
      done: boolean | null;
      doneReason: string | null;
      contentChars: number;
      thinkingChars: number;
      toolCallCount: number;
    };
  }>;
}
