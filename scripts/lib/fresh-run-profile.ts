/** Operator-selected windows. Actor text cannot extend these limits. */
import { z } from "zod";

const LocalInferenceLimits = z
  .object({
    contextWindowTokens: z.number().int().min(4096).max(262144),
    inputByteLimit: z.number().int().min(500).max(1048576),
    maxOutputTokens: z.number().int().min(1).max(16384),
  })
  .strict()
  .refine((value) => value.maxOutputTokens < value.contextWindowTokens, "Output must leave input context");

/** Explicit new-run settings; old configurations retain their existing allowances. */
export function localInferenceLimits(raw: unknown, exploratory: boolean) {
  const selected = LocalInferenceLimits.parse(
    raw ?? {
      contextWindowTokens: 32768,
      inputByteLimit: exploratory ? 64000 : 32000,
      maxOutputTokens: exploratory ? 8192 : 1536,
    },
  );
  return { ...selected, perCallTokenLimit: Math.max(40000, selected.contextWindowTokens) };
}

export const freshRunProfiles = {
  "start-codex-1h": {
    purpose: "fresh-codex-one-hour",
    durationMs: 3600000,
    exploratory: true,
    scope: "approved-fresh-codex-one-hour",
  },
  "start-canary": {
    purpose: "real-workflow-canary",
    durationMs: 900000,
    exploratory: false,
    scope: "bounded-real-canary",
  },
  "start-30m": {
    purpose: "fresh-half-hour",
    durationMs: 1800000,
    exploratory: true,
    scope: "approved-fresh-half-hour",
  },
  "start-6h": { purpose: "fresh-six-hour", durationMs: 21600000, exploratory: true, scope: "approved-fresh-six-hour" },
  "start-24h": { purpose: "fresh-24h", durationMs: 86400000, exploratory: false, scope: "approved-24h" },
} as const;
