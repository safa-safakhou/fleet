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
export const RC6SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R6-D", "R6-H", "R6-N"]) }).strict();
export const rc6Configuration = immutable({ ...rc5Configuration, participantContract: "scoped.v1" as const });
export type RC6Cell = Omit<RC5Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r6";
  stage: z.infer<typeof RC6SelectionSchema>["stage"];
  configuration: typeof rc6Configuration;
};
/** New actor/configuration boundary; RC5 seeds, grants and outcomes remain closed. */
export function prepareRC6Protocol(raw: unknown) {
  const input = RC6SelectionSchema.parse(raw),
    base = prepareRC5Protocol({ ...input, stage: input.stage.replace("R6-", "R5-") });
  const cells: RC6Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r6",
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
      study: "negotiation-r6" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r5:R5-", "negotiation-r6:R6-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc6Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc6-protocol.v1" as const,
    study: "negotiation-r6" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc6Configuration,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC6Protocol = ReturnType<typeof prepareRC6Protocol>;
export const RC7SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R7-D", "R7-H", "R7-N"]) }).strict();
export const rc7Configuration = immutable({ ...rc6Configuration, temporalEvidenceContract: "bounded.v1" as const });
export type RC7Cell = Omit<RC6Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r7";
  stage: z.infer<typeof RC7SelectionSchema>["stage"];
  configuration: typeof rc7Configuration;
};
/** New actor/configuration boundary; RC6 seeds, grants and outcomes remain closed. */
export function prepareRC7Protocol(raw: unknown) {
  const input = RC7SelectionSchema.parse(raw),
    base = prepareRC6Protocol({ ...input, stage: input.stage.replace("R7-", "R6-") });
  const cells: RC7Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r7",
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
      study: "negotiation-r7" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r6:R6-", "negotiation-r7:R7-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc7Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc7-protocol.v1" as const,
    study: "negotiation-r7" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc7Configuration,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC7Protocol = ReturnType<typeof prepareRC7Protocol>;
export const RC8SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R8-D", "R8-H", "R8-N"]) }).strict();
export const rc8Configuration = immutable({ ...rc7Configuration });
export const rc8ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC8Cell = Omit<RC7Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r8";
  stage: z.infer<typeof RC8SelectionSchema>["stage"];
  configuration: typeof rc8Configuration;
};
/** New actor/configuration boundary; RC7 seeds, grants and outcomes remain closed. */
export function prepareRC8Protocol(raw: unknown) {
  const input = RC8SelectionSchema.parse(raw),
    base = prepareRC7Protocol({ ...input, stage: input.stage.replace("R8-", "R7-") });
  const cells: RC8Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r8",
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
      study: "negotiation-r8" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r7:R7-", "negotiation-r8:R8-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc8Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc8-protocol.v1" as const,
    study: "negotiation-r8" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc8Configuration,
    modelProfile: rc8ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC8Protocol = ReturnType<typeof prepareRC8Protocol>;
export const RC9SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R9-D", "R9-H", "R9-N"]) }).strict();
export const rc9Configuration = immutable({ ...rc8Configuration, observationContract: "semantics.v1" as const });
export const rc9ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC9Cell = Omit<RC8Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r9";
  stage: z.infer<typeof RC9SelectionSchema>["stage"];
  configuration: typeof rc9Configuration;
};
/** New actor/configuration boundary; RC8 seeds, grants and outcomes remain closed. */
export function prepareRC9Protocol(raw: unknown) {
  const input = RC9SelectionSchema.parse(raw),
    base = prepareRC8Protocol({ ...input, stage: input.stage.replace("R9-", "R8-") });
  const cells: RC9Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r9",
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
      study: "negotiation-r9" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r8:R8-", "negotiation-r9:R9-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc9Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc9-protocol.v1" as const,
    study: "negotiation-r9" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc9Configuration,
    modelProfile: rc9ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC9Protocol = ReturnType<typeof prepareRC9Protocol>;
export const RC10SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R10-D", "R10-H", "R10-N"]) }).strict();
export const rc10Configuration = immutable({ ...rc9Configuration, clockContract: "scoped.v1" as const });
export const rc10ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC10Cell = Omit<RC9Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r10";
  stage: z.infer<typeof RC10SelectionSchema>["stage"];
  configuration: typeof rc10Configuration;
};
/** New actor/configuration boundary; RC9 seeds, grants and outcomes remain closed. */
export function prepareRC10Protocol(raw: unknown) {
  const input = RC10SelectionSchema.parse(raw),
    base = prepareRC9Protocol({ ...input, stage: input.stage.replace("R10-", "R9-") });
  const cells: RC10Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r10",
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
      study: "negotiation-r10" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r9:R9-", "negotiation-r10:R10-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc10Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc10-protocol.v1" as const,
    study: "negotiation-r10" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc10Configuration,
    modelProfile: rc10ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC10Protocol = ReturnType<typeof prepareRC10Protocol>;
export const RC11SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R11-D", "R11-H", "R11-N"]) }).strict();
export const rc11Configuration = immutable({ ...rc10Configuration, decisionContract: "read-final.v1" as const });
export const rc11ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC11Cell = Omit<RC10Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r11";
  stage: z.infer<typeof RC11SelectionSchema>["stage"];
  configuration: typeof rc11Configuration;
};
/** New actor/configuration boundary; RC10 seeds, grants and outcomes remain closed. */
export function prepareRC11Protocol(raw: unknown) {
  const input = RC11SelectionSchema.parse(raw),
    base = prepareRC10Protocol({ ...input, stage: input.stage.replace("R11-", "R10-") });
  const cells: RC11Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r11",
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
      study: "negotiation-r11" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r10:R10-", "negotiation-r11:R11-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc11Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc11-protocol.v1" as const,
    study: "negotiation-r11" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc11Configuration,
    modelProfile: rc11ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC11Protocol = ReturnType<typeof prepareRC11Protocol>;
export const RC12SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R12-D", "R12-H", "R12-N"]) }).strict();
export const rc12Configuration = immutable({ ...rc11Configuration, observationContract: "semantics.v2" as const });
export const rc12ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC12Cell = Omit<RC11Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r12";
  stage: z.infer<typeof RC12SelectionSchema>["stage"];
  configuration: typeof rc12Configuration;
};
/** New actor/configuration boundary; RC11 seeds, grants and outcomes remain closed. */
export function prepareRC12Protocol(raw: unknown) {
  const input = RC12SelectionSchema.parse(raw),
    base = prepareRC11Protocol({ ...input, stage: input.stage.replace("R12-", "R11-") });
  const cells: RC12Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r12",
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
      study: "negotiation-r12" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r11:R11-", "negotiation-r12:R12-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc12Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc12-protocol.v1" as const,
    study: "negotiation-r12" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc12Configuration,
    modelProfile: rc12ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC12Protocol = ReturnType<typeof prepareRC12Protocol>;
export const RC13SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R13-D", "R13-H", "R13-N"]) }).strict();
export const rc13Configuration = immutable({ ...rc12Configuration, observationContract: "semantics.v2" as const });
export const rc13ModelProfile = immutable({ route: "ollama" as const, model: "gemma4:12b", thinking: false });
export type RC13Cell = Omit<RC12Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r13";
  stage: z.infer<typeof RC13SelectionSchema>["stage"];
  configuration: typeof rc13Configuration;
};
/** New actor/configuration boundary; RC12 seeds, grants and outcomes remain closed. */
export function prepareRC13Protocol(raw: unknown) {
  const input = RC13SelectionSchema.parse(raw),
    base = prepareRC12Protocol({ ...input, stage: input.stage.replace("R13-", "R12-") });
  const cells: RC13Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r13",
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
      study: "negotiation-r13" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r12:R12-", "negotiation-r13:R13-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc13Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc13-protocol.v1" as const,
    study: "negotiation-r13" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc13Configuration,
    modelProfile: rc13ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC13Protocol = ReturnType<typeof prepareRC13Protocol>;
export type PostE3Cell =
  | RC1Cell
  | RC2Cell
  | RC3Cell
  | RC4Cell
  | RC5Cell
  | RC6Cell
  | RC7Cell
  | RC8Cell
  | RC9Cell
  | RC10Cell
  | RC11Cell
  | RC12Cell
  | RC13Cell;
export type PostE3Protocol =
  | RC1Protocol
  | RC2Protocol
  | RC3Protocol
  | RC4Protocol
  | RC5Protocol
  | RC6Protocol
  | RC7Protocol
  | RC8Protocol
  | RC9Protocol
  | RC10Protocol
  | RC11Protocol
  | RC12Protocol
  | RC13Protocol;
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
export function validateRC6Cell(protocol: RC6Protocol, cell: RC6Cell) {
  const canonical = prepareRC6Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC6_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC7Cell(protocol: RC7Protocol, cell: RC7Cell) {
  const canonical = prepareRC7Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC7_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC8Cell(protocol: RC8Protocol, cell: RC8Cell) {
  const canonical = prepareRC8Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC8_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC9Cell(protocol: RC9Protocol, cell: RC9Cell) {
  const canonical = prepareRC9Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC9_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC10Cell(protocol: RC10Protocol, cell: RC10Cell) {
  const canonical = prepareRC10Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC10_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC11Cell(protocol: RC11Protocol, cell: RC11Cell) {
  const canonical = prepareRC11Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC11_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC12Cell(protocol: RC12Protocol, cell: RC12Cell) {
  const canonical = prepareRC12Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC12_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC13Cell(protocol: RC13Protocol, cell: RC13Cell) {
  const canonical = prepareRC13Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC13_UNPLANNED_OR_CHANGED_CELL");
}
export function validatePostE3Cell(protocol: PostE3Protocol, cell: PostE3Cell) {
  if (protocol.study === "negotiation-r13" && cell.study === "negotiation-r13") return validateRC13Cell(protocol, cell);
  if (protocol.study === "negotiation-r12" && cell.study === "negotiation-r12") return validateRC12Cell(protocol, cell);
  if (protocol.study === "negotiation-r11" && cell.study === "negotiation-r11") return validateRC11Cell(protocol, cell);
  if (protocol.study === "negotiation-r10" && cell.study === "negotiation-r10") return validateRC10Cell(protocol, cell);
  if (protocol.study === "negotiation-r9" && cell.study === "negotiation-r9") return validateRC9Cell(protocol, cell);
  if (protocol.study === "negotiation-r8" && cell.study === "negotiation-r8") return validateRC8Cell(protocol, cell);
  if (protocol.study === "negotiation-r7" && cell.study === "negotiation-r7") return validateRC7Cell(protocol, cell);
  if (protocol.study === "negotiation-r6" && cell.study === "negotiation-r6") return validateRC6Cell(protocol, cell);
  if (protocol.study === "negotiation-r5" && cell.study === "negotiation-r5") return validateRC5Cell(protocol, cell);
  if (protocol.study === "negotiation-r4" && cell.study === "negotiation-r4") return validateRC4Cell(protocol, cell);
  if (protocol.study === "negotiation-r3" && cell.study === "negotiation-r3") return validateRC3Cell(protocol, cell);
  if (protocol.study === "negotiation-r2" && cell.study === "negotiation-r2") return validateRC2Cell(protocol, cell);
  if (protocol.study === "negotiation-r1" && cell.study === "negotiation-r1") return validateRC1Cell(protocol, cell);
  throw Error("POST_E3_STUDY_MISMATCH");
}
export function canonicalPostE3Protocol(protocol: PostE3Protocol) {
  if (protocol.study === "negotiation-r13") return prepareRC13Protocol(protocol.selection);
  if (protocol.study === "negotiation-r12") return prepareRC12Protocol(protocol.selection);
  if (protocol.study === "negotiation-r11") return prepareRC11Protocol(protocol.selection);
  if (protocol.study === "negotiation-r10") return prepareRC10Protocol(protocol.selection);
  if (protocol.study === "negotiation-r9") return prepareRC9Protocol(protocol.selection);
  if (protocol.study === "negotiation-r8") return prepareRC8Protocol(protocol.selection);
  if (protocol.study === "negotiation-r7") return prepareRC7Protocol(protocol.selection);
  if (protocol.study === "negotiation-r6") return prepareRC6Protocol(protocol.selection);
  if (protocol.study === "negotiation-r5") return prepareRC5Protocol(protocol.selection);
  if (protocol.study === "negotiation-r4") return prepareRC4Protocol(protocol.selection);
  if (protocol.study === "negotiation-r3") return prepareRC3Protocol(protocol.selection);
  return protocol.study === "negotiation-r2"
    ? prepareRC2Protocol(protocol.selection)
    : prepareRC1Protocol(protocol.selection);
}
