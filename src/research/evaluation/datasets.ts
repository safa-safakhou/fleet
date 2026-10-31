import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { digest } from "../contracts.js";
export const DatasetCaseSchema = z
  .object({
    id: z.string(),
    family: z.string(),
    world: z.string(),
    split: z.enum(["train", "development", "heldout"]),
    actorInput: z.string().max(20000),
    recordedOutput: z.record(z.string(), z.unknown()),
    rubric: z
      .object({
        expectedKind: z.string(),
        authorizedRefs: z.array(z.string()),
        requiredRefs: z.array(z.string()),
        forbiddenActions: z.boolean(),
        expectedFields: z.record(z.string(), z.unknown()).optional(),
        forbidCompletionClaim: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
export type DatasetCase = z.infer<typeof DatasetCaseSchema>;
const Manifest = z
  .object({
    schemaVersion: z.literal("fleet.dataset/v1"),
    id: z.string(),
    version: z.number().int(),
    files: z.object({ train: z.string(), development: z.string(), heldout: z.string() }).strict(),
    splitDigests: z.object({ train: z.string(), development: z.string(), heldout: z.string() }).strict(),
    records: z.array(
      z
        .object({
          id: z.string(),
          family: z.string(),
          world: z.string(),
          split: z.enum(["train", "development", "heldout"]),
          contentHash: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export async function loadDataset(
  path: string,
  role: "optimizer" | "evaluator",
  split?: "train" | "development" | "heldout",
) {
  if (role === "optimizer" && split === "heldout") throw Error("HELDOUT_ACCESS_DENIED");
  const manifest = Manifest.parse(JSON.parse(await readFile(path, "utf8"))),
    base = await realpath(dirname(path));
  for (const key of ["family", "world", "contentHash"] as const) {
    const seen = new Map<string, string>();
    for (const r of manifest.records) {
      const old = seen.get(r[key]);
      if (old && old !== r.split) throw Error("DATASET_SPLIT_OVERLAP");
      seen.set(r[key], r.split);
    }
  }
  if (new Set(manifest.records.map((r) => r.id)).size !== manifest.records.length) throw Error("DATASET_CASE_CONFLICT");
  const result: {
    manifest: typeof manifest;
    train: DatasetCase[];
    development: DatasetCase[];
    heldout?: DatasetCase[];
  } = { manifest, train: [], development: [] };
  for (const s of (split ? [split] : role === "optimizer" ? ["train", "development"] : ["development"]) as Array<
    "train" | "development" | "heldout"
  >) {
    const file = await realpath(resolve(base, manifest.files[s])),
      rel = relative(base, file);
    if (rel.startsWith("..") || isAbsolute(rel)) throw Error("DATASET_PATH_FORBIDDEN");
    const lines = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => DatasetCaseSchema.parse(JSON.parse(line)));
    if (digest(lines) !== manifest.splitDigests[s]) throw Error("DATASET_DIGEST_MISMATCH");
    for (const c of lines) {
      const declared = manifest.records.find((r) => r.id === c.id);
      if (
        !declared ||
        declared.split !== s ||
        c.split !== s ||
        declared.family !== c.family ||
        declared.world !== c.world ||
        declared.contentHash !== digest(c.actorInput)
      )
        throw Error("DATASET_PROVENANCE_MISMATCH");
    }
    if (lines.length !== manifest.records.filter((r) => r.split === s).length)
      throw Error("DATASET_POPULATION_MISMATCH");
    result[s] = lines;
  }
  return result;
}
