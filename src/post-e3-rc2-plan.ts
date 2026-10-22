import { createHash } from "node:crypto";
import { z } from "zod";
import design from "./negotiation/design.json" with { type: "json" };
import { designDigest } from "./negotiation-plan.js";
import {
  prepareRC1Protocol,
  type RC1Cell,
  type RC1Protocol,
  RC1SelectionSchema,
  rc1Configuration,
  validateRC1Cell,
} from "./post-e3-plan.js";
export const RC2SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R2-D", "R2-H", "R2-N"]) }).strict();
export type RC2Cell = Omit<RC1Cell, "study" | "stage"> & {
  study: "negotiation-r2";
  stage: z.infer<typeof RC2SelectionSchema>["stage"];
  periodicReviewMinutes: 30;
};
function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
/** RC2 changes host input bytes and external periodic review cadence. New namespace/seeds/grants never amend RC1. */
export function prepareRC2Protocol(raw: unknown) {
  const input = RC2SelectionSchema.parse(raw),
    base = prepareRC1Protocol({ ...input, stage: input.stage.replace("R2-", "R1-") });
  const cells: RC2Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r2",
          input.stage,
          original.family,
          original.variant,
          original.replicate,
          input.seedNonce,
        ]),
      )
      .digest("hex");
    const cell = {
      ...original,
      study: "negotiation-r2" as const,
      stage: input.stage,
      periodicReviewMinutes: 30 as const,
      id: original.id.replace("negotiation-r1:R1-", "negotiation-r2:R2-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      limits: { ...original.limits, inputBytes: 32000 },
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc2-protocol.v1" as const,
    study: "negotiation-r2" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    cells,
    native: { ...base.native, inputBytes: 32000, periodicMinutes: 30 },
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC2Protocol = ReturnType<typeof prepareRC2Protocol>;
export const RC3SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R3-D", "R3-H", "R3-N"]) }).strict();
export const rc3Configuration = immutable({ ...rc1Configuration, readQueryContract: "environment.v1" as const });
export type RC3Cell = Omit<RC2Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r3";
  stage: z.infer<typeof RC3SelectionSchema>["stage"];
  configuration: typeof rc3Configuration;
};
/** New actor/configuration boundary; RC2 seeds, grants and outcomes remain closed. */
export function prepareRC3Protocol(raw: unknown) {
  const input = RC3SelectionSchema.parse(raw),
    base = prepareRC2Protocol({ ...input, stage: input.stage.replace("R3-", "R2-") });
  const cells: RC3Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r3",
          input.stage,
          original.family,
          original.variant,
          original.replicate,
          input.seedNonce,
        ]),
      )
      .digest("hex");
    const cell = {
      ...original,
      study: "negotiation-r3" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r2:R2-", "negotiation-r3:R3-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc3Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc3-protocol.v1" as const,
    study: "negotiation-r3" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc3Configuration,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC3Protocol = ReturnType<typeof prepareRC3Protocol>;
export type PostE3Cell = RC1Cell | RC2Cell | RC3Cell;
export type PostE3Protocol = RC1Protocol | RC2Protocol | RC3Protocol;
export function validateRC2Cell(protocol: RC2Protocol, cell: RC2Cell) {
  const canonical = prepareRC2Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC2_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC3Cell(protocol: RC3Protocol, cell: RC3Cell) {
  const canonical = prepareRC3Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC3_UNPLANNED_OR_CHANGED_CELL");
}
export function validatePostE3Cell(protocol: PostE3Protocol, cell: PostE3Cell) {
  if (protocol.study === "negotiation-r3" && cell.study === "negotiation-r3") return validateRC3Cell(protocol, cell);
  if (protocol.study === "negotiation-r2" && cell.study === "negotiation-r2") return validateRC2Cell(protocol, cell);
  if (protocol.study === "negotiation-r1" && cell.study === "negotiation-r1") return validateRC1Cell(protocol, cell);
  throw Error("POST_E3_STUDY_MISMATCH");
}
export function canonicalPostE3Protocol(protocol: PostE3Protocol) {
  if (protocol.study === "negotiation-r3") return prepareRC3Protocol(protocol.selection);
  return protocol.study === "negotiation-r2"
    ? prepareRC2Protocol(protocol.selection)
    : prepareRC1Protocol(protocol.selection);
}
