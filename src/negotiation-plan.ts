import { createHash } from "node:crypto";
import { z } from "zod";
import manifest from "./negotiation/design.json" with { type: "json" };

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const profile = z.object({ id: z.literal("reactive-cognition"), version: z.enum(["1", "1.1", "2"]) }).strict();
const selectionSchema = z
  .object({
    sources: z.object({ fleet: z.string().regex(/^[a-f0-9]{40}$/), pact: z.string().regex(/^[a-f0-9]{40}$/) }).strict(),
    modelDigest: digest,
    policyDigest: digest,
    selectedProfile: profile,
    baselineAmendment: digest.optional(),
  })
  .strict();
export const negotiationBaselineAmendment = Object.freeze({
  schemaVersion: "fleet.negotiation-baseline-amendment.v1",
  approvedDate: "2026-10-21",
  original: "reactive-cognition@1",
  amended: "reactive-cognition@1.1",
  observationPolicy: "negotiation@1",
  generationSchema: "shared-generation-schema@1",
  continuity: "continuity@1",
  limitsChanged: false,
  originalCellsPreserved: true,
});
export type FrozenSelections = z.infer<typeof selectionSchema>;
export type CellLimits = typeof manifest.classes.P;
export type NegotiationCell = {
  id: string;
  stage: "E1" | "E2" | "E3" | "E4";
  family: string;
  variant: string;
  seed: number;
  replicate: number;
  split: "development" | "heldOut";
  profile: { id: string; version: string };
  modelDigest: string;
  policyDigest: string;
  configurationDigest: string;
  initialStateDigest: string;
  worldSeed: string;
  rolesReversed: boolean;
  clockMode: "controlled" | "native";
  realProviderAuthorized: false;
  limits: CellLimits;
  sources: FrozenSelections["sources"];
  baselineAmendment?: string;
};
export function designDigest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b, "en"))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export function negotiationPlan(stage: NegotiationCell["stage"], raw: unknown): NegotiationCell[] {
  const selected = selectionSchema.parse(raw);
  if (
    (selected.baselineAmendment !== undefined &&
      selected.baselineAmendment !== designDigest(negotiationBaselineAmendment)) ||
    (selected.selectedProfile.version === "1.1" && !selected.baselineAmendment)
  )
    throw Error("BASELINE_AMENDMENT_REQUIRED");
  const baselineVersion = selected.baselineAmendment ? "1.1" : "1";
  if (!["E1", "E2", "E3", "E4"].includes(stage)) throw Error("UNKNOWN_NEGOTIATION_STAGE");
  if (manifest.schemaVersion !== "pact.negotiation-design.v1" || manifest.realProviderAuthorized !== false)
    throw Error("FROZEN_NEGOTIATION_DESIGN_REQUIRED");
  const cells: NegotiationCell[] = [];
  const add = (
    familyId: string,
    variant: string,
    seed: number,
    replicate: number,
    version: string,
    rolesReversed: boolean,
  ) => {
    const family = manifest.families.find((f) => f.id === familyId);
    if (!family?.variants.includes(variant)) throw Error("UNPLANNED_NEGOTIATION_CELL");
    const limits = manifest.classes[family.class as keyof typeof manifest.classes];
    const id = `negotiation-v1:${stage}:${familyId}:${variant}:${seed}:${replicate}:v${version}:${rolesReversed ? "BA" : "AB"}`;
    const initialStateDigest = designDigest({
      state: family.initialState,
      variant,
      rolesReversed,
      rulesId: manifest.rulesId,
    });
    const cell = {
      id,
      stage,
      family: familyId,
      variant,
      seed,
      replicate,
      split: stage === "E1" || stage === "E2" ? ("development" as const) : ("heldOut" as const),
      profile: { id: "reactive-cognition", version },
      modelDigest: selected.modelDigest,
      policyDigest: selected.policyDigest,
      sources: selected.sources,
      ...(selected.baselineAmendment ? { baselineAmendment: selected.baselineAmendment } : {}),
      initialStateDigest,
      worldSeed: designDigest({ id, seed }),
      rolesReversed,
      clockMode: stage === "E4" ? ("native" as const) : ("controlled" as const),
      realProviderAuthorized: false as const,
      limits: Object.freeze({ ...limits }),
    };
    cells.push(
      Object.freeze({ ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(manifest) }) }),
    );
  };
  if (stage === "E1") for (const family of ["C01", "C02"]) add(family, "default", 11, 1, baselineVersion, false);
  if (stage === "E2")
    for (const seed of [11, 29])
      for (const version of [baselineVersion, "2"])
        for (const family of ["C01", "C02", "C05"]) add(family, "default", seed, 1, version, seed === 29);
  if (stage === "E3")
    for (let rep = 1; rep <= 5; rep++)
      for (const family of manifest.families)
        for (const variant of family.variants)
          add(family.id, variant, rep % 2 ? 47 : 83, rep, selected.selectedProfile.version, rep % 2 === 0);
  if (stage === "E4")
    for (let rep = 1; rep <= 2; rep++)
      add("C01", "default", rep === 1 ? 47 : 83, rep, selected.selectedProfile.version, rep === 2);
  return cells;
}
