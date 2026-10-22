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
export const RC4SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R4-D", "R4-H", "R4-N"]) }).strict();
export const rc4Configuration = immutable({ ...rc1Configuration, readQueryContract: "environment.v1" as const });
export type RC4Cell = Omit<RC3Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r4";
  stage: z.infer<typeof RC4SelectionSchema>["stage"];
  configuration: typeof rc4Configuration;
};
/** New actor/configuration boundary; RC3 seeds, grants and outcomes remain closed. */
export function prepareRC4Protocol(raw: unknown) {
  const input = RC4SelectionSchema.parse(raw),
    base = prepareRC3Protocol({ ...input, stage: input.stage.replace("R4-", "R3-") });
  const cells: RC4Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r4",
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
      study: "negotiation-r4" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r3:R3-", "negotiation-r4:R4-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc4Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc4-protocol.v1" as const,
    study: "negotiation-r4" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc4Configuration,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC4Protocol = ReturnType<typeof prepareRC4Protocol>;
export const RC5SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R5-D", "R5-H", "R5-N"]) }).strict();
export const rc5Configuration = immutable({ ...rc4Configuration, intentAuthorityContract: "separate.v1" as const });
export type RC5Cell = Omit<RC4Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r5";
  stage: z.infer<typeof RC5SelectionSchema>["stage"];
  configuration: typeof rc5Configuration;
};
/** New actor/configuration boundary; RC4 seeds, grants and outcomes remain closed. */
export function prepareRC5Protocol(raw: unknown) {
  const input = RC5SelectionSchema.parse(raw),
    base = prepareRC4Protocol({ ...input, stage: input.stage.replace("R5-", "R4-") });
  const cells: RC5Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r5",
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
      study: "negotiation-r5" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r4:R4-", "negotiation-r5:R5-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc5Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc5-protocol.v1" as const,
    study: "negotiation-r5" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc5Configuration,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC5Protocol = ReturnType<typeof prepareRC5Protocol>;
export type PostE3Cell = RC1Cell | RC2Cell | RC3Cell | RC4Cell | RC5Cell;
export type PostE3Protocol = RC1Protocol | RC2Protocol | RC3Protocol | RC4Protocol | RC5Protocol;
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
export function validateRC4Cell(protocol: RC4Protocol, cell: RC4Cell) {
  const canonical = prepareRC4Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC4_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC5Cell(protocol: RC5Protocol, cell: RC5Cell) {
  const canonical = prepareRC5Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC5_UNPLANNED_OR_CHANGED_CELL");
}
export function validatePostE3Cell(protocol: PostE3Protocol, cell: PostE3Cell) {
  if (protocol.study === "negotiation-r5" && cell.study === "negotiation-r5") return validateRC5Cell(protocol, cell);
  if (protocol.study === "negotiation-r4" && cell.study === "negotiation-r4") return validateRC4Cell(protocol, cell);
  if (protocol.study === "negotiation-r3" && cell.study === "negotiation-r3") return validateRC3Cell(protocol, cell);
  if (protocol.study === "negotiation-r2" && cell.study === "negotiation-r2") return validateRC2Cell(protocol, cell);
  if (protocol.study === "negotiation-r1" && cell.study === "negotiation-r1") return validateRC1Cell(protocol, cell);
  throw Error("POST_E3_STUDY_MISMATCH");
}
export function canonicalPostE3Protocol(protocol: PostE3Protocol) {
  if (protocol.study === "negotiation-r5") return prepareRC5Protocol(protocol.selection);
  if (protocol.study === "negotiation-r4") return prepareRC4Protocol(protocol.selection);
  if (protocol.study === "negotiation-r3") return prepareRC3Protocol(protocol.selection);
  return protocol.study === "negotiation-r2"
    ? prepareRC2Protocol(protocol.selection)
    : prepareRC1Protocol(protocol.selection);
}
