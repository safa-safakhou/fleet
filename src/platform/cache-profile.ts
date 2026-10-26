import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { FleetError, type ModelPort, type ModelSettings } from "../domain.js";

const positive = z.number().int().min(1).max(4194304);
const profileSchema = z
  .object({
    schemaVersion: z.literal("fleet.vllm-cache-profile.v1"),
    providerVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    model: z.string().min(1).max(200),
    endpoint: z
      .string()
      .url()
      .refine((value) => {
        const u = new URL(value);
        return !u.username && !u.password && !u.search && !u.hash;
      }),
    instanceId: z.string().min(1).max(200),
    engineConfigSha256: z.string().regex(/^[a-f0-9]{64}$/),
    contextLength: positive.max(262144),
    maxNumSeqs: positive.max(16),
    prefixCaching: z.literal(false),
    speculativeDecoding: z.literal(false),
    poolBlocks: positive,
    nullBlocks: z.literal(1),
    safetyBlocks: positive,
    groups: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("mamba"), mode: z.literal("none"), blocksPerRequest: positive.max(64) }).strict(),
          z.object({ kind: z.literal("full-attention"), blockTokens: positive.max(262144) }).strict(),
        ]),
      )
      .min(1)
      .max(128),
  })
  .strict()
  .refine((p) => p.poolBlocks > p.nullBlocks + p.safetyBlocks);
export type CacheProfile = z.infer<typeof profileSchema>;
export type CapacityResource = { unit: string; capacity: number; fingerprint: string };
export type CapacityDemand = number | { tokenUnits: number; resourceUnits: number };
export function parseCacheProfile(value: unknown): CacheProfile {
  const result = profileSchema.safeParse(value);
  if (!result.success) throw new FleetError("INVALID_PROVIDER_CACHE_PROFILE", true);
  return result.data;
}
export function loadCacheProfile(path: string | undefined): CacheProfile | undefined {
  if (path === undefined) return undefined;
  try {
    if (statSync(path).size > 65536) throw Error("profile size");
    const text = readFileSync(path, "utf8");
    if (Buffer.byteLength(text) > 65536) throw Error("profile size");
    return parseCacheProfile(JSON.parse(text));
  } catch {
    throw new FleetError("INVALID_PROVIDER_CACHE_PROFILE", true);
  }
}
export function cacheResource(profile: CacheProfile): CapacityResource {
  return {
    unit: "kv-cache-blocks.v1",
    capacity: profile.poolBlocks - profile.nullBlocks - profile.safetyBlocks,
    fingerprint: createHash("sha256").update(JSON.stringify(profile)).digest("hex"),
  };
}
export function assertCacheSelection(profile: CacheProfile, model: ModelSettings, endpoint?: string, slots?: number) {
  if (
    model.route !== "openai-compatible" ||
    model.provider !== "vllm" ||
    model.model !== profile.model ||
    (endpoint !== undefined && endpoint.replace(/\/$/, "") !== profile.endpoint.replace(/\/$/, "")) ||
    (slots !== undefined && slots > profile.maxNumSeqs)
  )
    throw new FleetError("PROVIDER_CACHE_PROFILE_MISMATCH", true);
}
export function cacheRequestBlocks(profile: CacheProfile, totalTokens: number) {
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 1 || totalTokens > profile.contextLength)
    throw new FleetError("PROVIDER_CONTEXT_CAPACITY", true);
  return profile.groups.reduce(
    (n, g) => n + (g.kind === "mamba" ? g.blocksPerRequest : Math.ceil(totalTokens / g.blockTokens)),
    0,
  );
}
export async function capacityDemand(
  model: Pick<ModelPort, "estimateInputTokens">,
  profile: CacheProfile | undefined,
  request: Parameters<ModelPort["decide"]>[0],
): Promise<CapacityDemand> {
  if (profile) assertCacheSelection(profile, request.model);
  if (!model.estimateInputTokens) throw new FleetError("PROVIDER_TOKENIZER_REQUIRED", true);
  const input = await model.estimateInputTokens(request);
  if (
    !Number.isSafeInteger(input) ||
    input < 1 ||
    !Number.isSafeInteger(request.maxOutputTokens) ||
    request.maxOutputTokens < 1
  )
    throw new FleetError("PROVIDER_CONTEXT_CAPACITY", true);
  const tokenUnits = input + request.maxOutputTokens;
  return profile ? { tokenUnits, resourceUnits: cacheRequestBlocks(profile, tokenUnits) } : tokenUnits;
}
