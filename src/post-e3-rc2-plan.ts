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
export const RC14SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R14-D", "R14-H", "R14-N"]) }).strict();
export const rc14Configuration = immutable({
  ...rc13Configuration,
  clockContract: "scoped.v2" as const,
  responseContract: "visible.v1" as const,
});
export const rc14ModelProfile = immutable({ route: "ollama" as const, model: "gemma4:12b", thinking: true });
export type RC14Cell = Omit<RC13Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r14";
  stage: z.infer<typeof RC14SelectionSchema>["stage"];
  configuration: typeof rc14Configuration;
};
/** New actor/configuration boundary; RC13 seeds, grants and outcomes remain closed. */
export function prepareRC14Protocol(raw: unknown) {
  const input = RC14SelectionSchema.parse(raw),
    base = prepareRC13Protocol({ ...input, stage: input.stage.replace("R14-", "R13-") });
  const cells: RC14Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r14",
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
      study: "negotiation-r14" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r13:R13-", "negotiation-r14:R14-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc14Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc14-protocol.v1" as const,
    study: "negotiation-r14" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc14Configuration,
    modelProfile: rc14ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC14Protocol = ReturnType<typeof prepareRC14Protocol>;
export const RC15SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R15-D", "R15-H", "R15-N"]) }).strict();
export const rc15Configuration = immutable({
  ...rc14Configuration,
  clockContract: "scoped.v2" as const,
  intentAuthorityContract: "separate.v2" as const,
  observationPolicyVersion: "2" as const,
  responseContract: "visible.v1" as const,
});
export const rc15ModelProfile = immutable({ route: "ollama" as const, model: "gemma4:12b", thinking: false });
export type RC15Cell = Omit<RC14Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r15";
  stage: z.infer<typeof RC15SelectionSchema>["stage"];
  configuration: typeof rc15Configuration;
};
/** New actor/configuration boundary; RC14 seeds, grants and outcomes remain closed. */
export function prepareRC15Protocol(raw: unknown) {
  const input = RC15SelectionSchema.parse(raw),
    base = prepareRC14Protocol({ ...input, stage: input.stage.replace("R15-", "R14-") });
  const cells: RC15Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r15",
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
      study: "negotiation-r15" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r14:R14-", "negotiation-r15:R15-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc15Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc15-protocol.v1" as const,
    study: "negotiation-r15" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc15Configuration,
    modelProfile: rc15ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC15Protocol = ReturnType<typeof prepareRC15Protocol>;
export const RC16SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R16-D", "R16-H", "R16-N"]) }).strict();
export const rc16Configuration = immutable({
  ...rc15Configuration,
  clockContract: "scoped.v2" as const,
  intentAuthorityContract: "separate.v2" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc16ModelProfile = immutable({ route: "ollama" as const, model: "gemma4:12b", thinking: false });
export type RC16Cell = Omit<RC15Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r16";
  stage: z.infer<typeof RC16SelectionSchema>["stage"];
  configuration: typeof rc16Configuration;
};
/** New actor/configuration boundary; RC15 seeds, grants and outcomes remain closed. */
export function prepareRC16Protocol(raw: unknown) {
  const input = RC16SelectionSchema.parse(raw),
    base = prepareRC15Protocol({ ...input, stage: input.stage.replace("R16-", "R15-") });
  const cells: RC16Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r16",
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
      study: "negotiation-r16" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r15:R15-", "negotiation-r16:R16-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc16Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc16-protocol.v1" as const,
    study: "negotiation-r16" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc16Configuration,
    modelProfile: rc16ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC16Protocol = ReturnType<typeof prepareRC16Protocol>;
export const RC17SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R17-D", "R17-H", "R17-N"]) }).strict();
export const rc17Configuration = immutable({
  ...rc16Configuration,
  clockContract: "scoped.v2" as const,
  intentAuthorityContract: "separate.v2" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc17ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC17Cell = Omit<RC16Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r17";
  stage: z.infer<typeof RC17SelectionSchema>["stage"];
  configuration: typeof rc17Configuration;
};
/** New actor/configuration boundary; RC16 seeds, grants and outcomes remain closed. */
export function prepareRC17Protocol(raw: unknown) {
  const input = RC17SelectionSchema.parse(raw),
    base = prepareRC16Protocol({ ...input, stage: input.stage.replace("R17-", "R16-") });
  const cells: RC17Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r17",
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
      study: "negotiation-r17" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r16:R16-", "negotiation-r17:R17-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc17Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc17-protocol.v1" as const,
    study: "negotiation-r17" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc17Configuration,
    modelProfile: rc17ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC17Protocol = ReturnType<typeof prepareRC17Protocol>;
export const RC18SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R18-D", "R18-H", "R18-N"]) }).strict();
export const rc18Configuration = immutable({
  ...rc17Configuration,
  clockContract: "scoped.v2" as const,
  intentAuthorityContract: "separate.v3" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc18ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC18Cell = Omit<RC17Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r18";
  stage: z.infer<typeof RC18SelectionSchema>["stage"];
  configuration: typeof rc18Configuration;
};
/** New actor/configuration boundary; RC17 seeds, grants and outcomes remain closed. */
export function prepareRC18Protocol(raw: unknown) {
  const input = RC18SelectionSchema.parse(raw),
    base = prepareRC17Protocol({ ...input, stage: input.stage.replace("R18-", "R17-") });
  const cells: RC18Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r18",
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
      study: "negotiation-r18" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r17:R17-", "negotiation-r18:R18-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc18Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc18-protocol.v1" as const,
    study: "negotiation-r18" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc18Configuration,
    modelProfile: rc18ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC18Protocol = ReturnType<typeof prepareRC18Protocol>;
export const RC19SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R19-D", "R19-H", "R19-N"]) }).strict();
export const rc19Configuration = immutable({
  ...rc18Configuration,
  clockContract: "scoped.v2" as const,
  goalReferenceContract: "scoped.v1" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc19ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC19Cell = Omit<RC18Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r19";
  stage: z.infer<typeof RC19SelectionSchema>["stage"];
  configuration: typeof rc19Configuration;
};
/** New actor/configuration boundary; RC18 seeds, grants and outcomes remain closed. */
export function prepareRC19Protocol(raw: unknown) {
  const input = RC19SelectionSchema.parse(raw),
    base = prepareRC18Protocol({ ...input, stage: input.stage.replace("R19-", "R18-") });
  const cells: RC19Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r19",
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
      study: "negotiation-r19" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r18:R18-", "negotiation-r19:R19-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc19Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc19-protocol.v1" as const,
    study: "negotiation-r19" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc19Configuration,
    modelProfile: rc19ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC19Protocol = ReturnType<typeof prepareRC19Protocol>;
export const RC20SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R20-D", "R20-H", "R20-N"]) }).strict();
export const rc20Configuration = immutable({
  ...rc19Configuration,
  clockContract: "scoped.v2" as const,
  decisionContract: "read-final.v2" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc20ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC20Cell = Omit<RC19Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r20";
  stage: z.infer<typeof RC20SelectionSchema>["stage"];
  configuration: typeof rc20Configuration;
};
/** New actor/configuration boundary; RC19 seeds, grants and outcomes remain closed. */
export function prepareRC20Protocol(raw: unknown) {
  const input = RC20SelectionSchema.parse(raw),
    base = prepareRC19Protocol({ ...input, stage: input.stage.replace("R20-", "R19-") });
  const cells: RC20Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r20",
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
      study: "negotiation-r20" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r19:R19-", "negotiation-r20:R20-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc20Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc20-protocol.v1" as const,
    study: "negotiation-r20" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc20Configuration,
    modelProfile: rc20ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC20Protocol = ReturnType<typeof prepareRC20Protocol>;
export const RC21SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R21-D", "R21-H", "R21-N"]) }).strict();
export const rc21Configuration = immutable({
  ...rc20Configuration,
  clockContract: "scoped.v2" as const,
  decisionContract: "read-final.v2" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc21ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC21Cell = Omit<RC20Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r21";
  stage: z.infer<typeof RC21SelectionSchema>["stage"];
  configuration: typeof rc21Configuration;
};
/** New actor/configuration boundary; RC20 seeds, grants and outcomes remain closed. */
export function prepareRC21Protocol(raw: unknown) {
  const input = RC21SelectionSchema.parse(raw),
    base = prepareRC20Protocol({ ...input, stage: input.stage.replace("R21-", "R20-") });
  const cells: RC21Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r21",
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
      study: "negotiation-r21" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r20:R20-", "negotiation-r21:R21-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc21Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc21-protocol.v1" as const,
    study: "negotiation-r21" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc21Configuration,
    modelProfile: rc21ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC21Protocol = ReturnType<typeof prepareRC21Protocol>;
export const RC22SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R22-D", "R22-H", "R22-N"]) }).strict();
export const rc22Configuration = immutable({
  ...rc21Configuration,
  clockContract: "scoped.v2" as const,
  readQueryContract: "environment.v2" as const,
  observationPolicyVersion: "2" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc22ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC22Cell = Omit<RC21Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r22";
  stage: z.infer<typeof RC22SelectionSchema>["stage"];
  configuration: typeof rc22Configuration;
};
/** New actor/configuration boundary; RC21 seeds, grants and outcomes remain closed. */
export function prepareRC22Protocol(raw: unknown) {
  const input = RC22SelectionSchema.parse(raw),
    base = prepareRC21Protocol({ ...input, stage: input.stage.replace("R22-", "R21-") });
  const cells: RC22Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r22",
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
      study: "negotiation-r22" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r21:R21-", "negotiation-r22:R22-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc22Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc22-protocol.v1" as const,
    study: "negotiation-r22" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc22Configuration,
    modelProfile: rc22ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC22Protocol = ReturnType<typeof prepareRC22Protocol>;
export const RC23SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R23-D", "R23-H", "R23-N"]) }).strict();
export const rc23Configuration = immutable({
  ...rc22Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v3" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "3" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc23ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC23Cell = Omit<RC22Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r23";
  stage: z.infer<typeof RC23SelectionSchema>["stage"];
  configuration: typeof rc23Configuration;
};
/** New actor/configuration boundary; RC22 seeds, grants and outcomes remain closed. */
export function prepareRC23Protocol(raw: unknown) {
  const input = RC23SelectionSchema.parse(raw),
    base = prepareRC22Protocol({ ...input, stage: input.stage.replace("R23-", "R22-") });
  const cells: RC23Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r23",
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
      study: "negotiation-r23" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r22:R22-", "negotiation-r23:R23-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc23Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc23-protocol.v1" as const,
    study: "negotiation-r23" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc23Configuration,
    modelProfile: rc23ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC23Protocol = ReturnType<typeof prepareRC23Protocol>;
export const RC24SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R24-D", "R24-H", "R24-N"]) }).strict();
export const rc24Configuration = immutable({
  ...rc23Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "3" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc24ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC24Cell = Omit<RC23Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r24";
  stage: z.infer<typeof RC24SelectionSchema>["stage"];
  configuration: typeof rc24Configuration;
};
/** New actor/configuration boundary; RC23 seeds, grants and outcomes remain closed. */
export function prepareRC24Protocol(raw: unknown) {
  const input = RC24SelectionSchema.parse(raw),
    base = prepareRC23Protocol({ ...input, stage: input.stage.replace("R24-", "R23-") });
  const cells: RC24Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r24",
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
      study: "negotiation-r24" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r23:R23-", "negotiation-r24:R24-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc24Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc24-protocol.v1" as const,
    study: "negotiation-r24" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc24Configuration,
    modelProfile: rc24ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC24Protocol = ReturnType<typeof prepareRC24Protocol>;
export const RC25SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R25-D", "R25-H", "R25-N"]) }).strict();
export const rc25Configuration = immutable({
  ...rc24Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "4" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc25ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: false });
export type RC25Cell = Omit<RC24Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r25";
  stage: z.infer<typeof RC25SelectionSchema>["stage"];
  configuration: typeof rc25Configuration;
};
/** New actor/configuration boundary; RC24 seeds, grants and outcomes remain closed. */
export function prepareRC25Protocol(raw: unknown) {
  const input = RC25SelectionSchema.parse(raw),
    base = prepareRC24Protocol({ ...input, stage: input.stage.replace("R25-", "R24-") });
  const cells: RC25Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r25",
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
      study: "negotiation-r25" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r24:R24-", "negotiation-r25:R25-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc25Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc25-protocol.v1" as const,
    study: "negotiation-r25" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc25Configuration,
    modelProfile: rc25ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC25Protocol = ReturnType<typeof prepareRC25Protocol>;
export const RC26SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R26-D", "R26-H", "R26-N"]) }).strict();
export const rc26Configuration = immutable({
  ...rc25Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "4" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc26ModelProfile = immutable({ route: "ollama" as const, model: "qwen3:14b", thinking: true });
export type RC26Cell = Omit<RC25Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r26";
  stage: z.infer<typeof RC26SelectionSchema>["stage"];
  configuration: typeof rc26Configuration;
};
/** New actor/configuration boundary; RC25 seeds, grants and outcomes remain closed. */
export function prepareRC26Protocol(raw: unknown) {
  const input = RC26SelectionSchema.parse(raw),
    base = prepareRC25Protocol({ ...input, stage: input.stage.replace("R26-", "R25-") });
  const cells: RC26Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r26",
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
      study: "negotiation-r26" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r25:R25-", "negotiation-r26:R26-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc26Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc26-protocol.v1" as const,
    study: "negotiation-r26" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc26Configuration,
    modelProfile: rc26ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC26Protocol = ReturnType<typeof prepareRC26Protocol>;
export const RC27SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R27-D", "R27-H", "R27-N"]) }).strict();
export const rc27Configuration = immutable({
  ...rc26Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "4" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc27ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: false });
export type RC27Cell = Omit<RC26Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r27";
  stage: z.infer<typeof RC27SelectionSchema>["stage"];
  configuration: typeof rc27Configuration;
};
/** New actor/configuration boundary; RC26 seeds, grants and outcomes remain closed. */
export function prepareRC27Protocol(raw: unknown) {
  const input = RC27SelectionSchema.parse(raw),
    base = prepareRC26Protocol({ ...input, stage: input.stage.replace("R27-", "R26-") });
  const cells: RC27Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r27",
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
      study: "negotiation-r27" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r26:R26-", "negotiation-r27:R27-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc27Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc27-protocol.v1" as const,
    study: "negotiation-r27" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc27Configuration,
    modelProfile: rc27ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC27Protocol = ReturnType<typeof prepareRC27Protocol>;
export const RC28SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R28-D", "R28-H", "R28-N"]) }).strict();
export const rc28Configuration = immutable({
  ...rc27Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "4" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc28ModelProfile = immutable({ route: "ollama" as const, model: "qwen3.5:9b", thinking: true });
export type RC28Cell = Omit<RC27Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r28";
  stage: z.infer<typeof RC28SelectionSchema>["stage"];
  configuration: typeof rc28Configuration;
};
/** New actor/configuration boundary; RC27 seeds, grants and outcomes remain closed. */
export function prepareRC28Protocol(raw: unknown) {
  const input = RC28SelectionSchema.parse(raw),
    base = prepareRC27Protocol({ ...input, stage: input.stage.replace("R28-", "R27-") });
  const cells: RC28Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r28",
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
      study: "negotiation-r28" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r27:R27-", "negotiation-r28:R28-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc28Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc28-protocol.v1" as const,
    study: "negotiation-r28" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc28Configuration,
    modelProfile: rc28ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC28Protocol = ReturnType<typeof prepareRC28Protocol>;
export const RC29SelectionSchema = RC1SelectionSchema.extend({ stage: z.enum(["R29-D", "R29-H", "R29-N"]) }).strict();
export const rc29Configuration = immutable({
  ...rc28Configuration,
  contextPackingContract: "required-first.v1" as const,
  readQueryContract: "environment.v4" as const,
  clockContract: "scoped.v2" as const,
  observationPolicyVersion: "4" as const,
  skillReferenceContract: "listed.v1" as const,
  responseContract: "visible.v1" as const,
});
export const rc29ModelProfile = immutable({ route: "ollama" as const, model: "granite4.2:8b", thinking: false });
export type RC29Cell = Omit<RC28Cell, "study" | "stage" | "configuration"> & {
  study: "negotiation-r29";
  stage: z.infer<typeof RC29SelectionSchema>["stage"];
  configuration: typeof rc29Configuration;
};
/** New actor/configuration boundary; RC28 seeds, grants and outcomes remain closed. */
export function prepareRC29Protocol(raw: unknown) {
  const input = RC29SelectionSchema.parse(raw),
    base = prepareRC28Protocol({ ...input, stage: input.stage.replace("R29-", "R28-") });
  const cells: RC29Cell[] = base.cells.map(({ configurationDigest: _old, ...original }) => {
    const worldSeed = createHash("sha256")
      .update(
        JSON.stringify([
          "negotiation-r29",
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
      study: "negotiation-r29" as const,
      stage: input.stage,
      id: original.id.replace("negotiation-r28:R28-", "negotiation-r29:R29-"),
      worldSeed,
      seed: Number.parseInt(worldSeed.slice(0, 8), 16),
      configuration: rc29Configuration,
    };
    return { ...cell, configurationDigest: designDigest({ cell, designDigest: designDigest(design) }) };
  });
  const { digest: _old, ...prior } = base;
  const protocol = {
    ...prior,
    schemaVersion: "fleet.rc29-protocol.v1" as const,
    study: "negotiation-r29" as const,
    selection: { ...input, batchNonce: base.selection.batchNonce },
    configuration: rc29Configuration,
    modelProfile: rc29ModelProfile,
    cells,
  };
  return immutable({ ...protocol, digest: designDigest(protocol) });
}
export type RC29Protocol = ReturnType<typeof prepareRC29Protocol>;
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
  | RC13Cell
  | RC14Cell
  | RC15Cell
  | RC16Cell
  | RC17Cell
  | RC18Cell
  | RC19Cell
  | RC20Cell
  | RC21Cell
  | RC22Cell
  | RC23Cell
  | RC24Cell
  | RC25Cell
  | RC26Cell
  | RC27Cell
  | RC28Cell
  | RC29Cell;
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
  | RC13Protocol
  | RC14Protocol
  | RC15Protocol
  | RC16Protocol
  | RC17Protocol
  | RC18Protocol
  | RC19Protocol
  | RC20Protocol
  | RC21Protocol
  | RC22Protocol
  | RC23Protocol
  | RC24Protocol
  | RC25Protocol
  | RC26Protocol
  | RC27Protocol
  | RC28Protocol
  | RC29Protocol;
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
export function validateRC14Cell(protocol: RC14Protocol, cell: RC14Cell) {
  const canonical = prepareRC14Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC14_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC15Cell(protocol: RC15Protocol, cell: RC15Cell) {
  const canonical = prepareRC15Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC15_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC16Cell(protocol: RC16Protocol, cell: RC16Cell) {
  const canonical = prepareRC16Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC16_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC17Cell(protocol: RC17Protocol, cell: RC17Cell) {
  const canonical = prepareRC17Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC17_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC18Cell(protocol: RC18Protocol, cell: RC18Cell) {
  const canonical = prepareRC18Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC18_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC19Cell(protocol: RC19Protocol, cell: RC19Cell) {
  const canonical = prepareRC19Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC19_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC20Cell(protocol: RC20Protocol, cell: RC20Cell) {
  const canonical = prepareRC20Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC20_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC21Cell(protocol: RC21Protocol, cell: RC21Cell) {
  const canonical = prepareRC21Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC21_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC22Cell(protocol: RC22Protocol, cell: RC22Cell) {
  const canonical = prepareRC22Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC22_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC23Cell(protocol: RC23Protocol, cell: RC23Cell) {
  const canonical = prepareRC23Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC23_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC24Cell(protocol: RC24Protocol, cell: RC24Cell) {
  const canonical = prepareRC24Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC24_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC25Cell(protocol: RC25Protocol, cell: RC25Cell) {
  const canonical = prepareRC25Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC25_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC26Cell(protocol: RC26Protocol, cell: RC26Cell) {
  const canonical = prepareRC26Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC26_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC27Cell(protocol: RC27Protocol, cell: RC27Cell) {
  const canonical = prepareRC27Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC27_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC28Cell(protocol: RC28Protocol, cell: RC28Cell) {
  const canonical = prepareRC28Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC28_UNPLANNED_OR_CHANGED_CELL");
}
export function validateRC29Cell(protocol: RC29Protocol, cell: RC29Cell) {
  const canonical = prepareRC29Protocol(protocol.selection);
  if (
    designDigest(canonical) !== designDigest(protocol) ||
    !canonical.cells.some((c) => designDigest(c) === designDigest(cell))
  )
    throw Error("RC29_UNPLANNED_OR_CHANGED_CELL");
}
export function validatePostE3Cell(protocol: PostE3Protocol, cell: PostE3Cell) {
  if (protocol.study === "negotiation-r29" && cell.study === "negotiation-r29") return validateRC29Cell(protocol, cell);
  if (protocol.study === "negotiation-r28" && cell.study === "negotiation-r28") return validateRC28Cell(protocol, cell);
  if (protocol.study === "negotiation-r27" && cell.study === "negotiation-r27") return validateRC27Cell(protocol, cell);
  if (protocol.study === "negotiation-r26" && cell.study === "negotiation-r26") return validateRC26Cell(protocol, cell);
  if (protocol.study === "negotiation-r25" && cell.study === "negotiation-r25") return validateRC25Cell(protocol, cell);
  if (protocol.study === "negotiation-r24" && cell.study === "negotiation-r24") return validateRC24Cell(protocol, cell);
  if (protocol.study === "negotiation-r23" && cell.study === "negotiation-r23") return validateRC23Cell(protocol, cell);
  if (protocol.study === "negotiation-r22" && cell.study === "negotiation-r22") return validateRC22Cell(protocol, cell);
  if (protocol.study === "negotiation-r21" && cell.study === "negotiation-r21") return validateRC21Cell(protocol, cell);
  if (protocol.study === "negotiation-r20" && cell.study === "negotiation-r20") return validateRC20Cell(protocol, cell);
  if (protocol.study === "negotiation-r19" && cell.study === "negotiation-r19") return validateRC19Cell(protocol, cell);
  if (protocol.study === "negotiation-r18" && cell.study === "negotiation-r18") return validateRC18Cell(protocol, cell);
  if (protocol.study === "negotiation-r17" && cell.study === "negotiation-r17") return validateRC17Cell(protocol, cell);
  if (protocol.study === "negotiation-r16" && cell.study === "negotiation-r16") return validateRC16Cell(protocol, cell);
  if (protocol.study === "negotiation-r15" && cell.study === "negotiation-r15") return validateRC15Cell(protocol, cell);
  if (protocol.study === "negotiation-r14" && cell.study === "negotiation-r14") return validateRC14Cell(protocol, cell);
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
  if (protocol.study === "negotiation-r29") return prepareRC29Protocol(protocol.selection);
  if (protocol.study === "negotiation-r28") return prepareRC28Protocol(protocol.selection);
  if (protocol.study === "negotiation-r27") return prepareRC27Protocol(protocol.selection);
  if (protocol.study === "negotiation-r26") return prepareRC26Protocol(protocol.selection);
  if (protocol.study === "negotiation-r25") return prepareRC25Protocol(protocol.selection);
  if (protocol.study === "negotiation-r24") return prepareRC24Protocol(protocol.selection);
  if (protocol.study === "negotiation-r23") return prepareRC23Protocol(protocol.selection);
  if (protocol.study === "negotiation-r22") return prepareRC22Protocol(protocol.selection);
  if (protocol.study === "negotiation-r21") return prepareRC21Protocol(protocol.selection);
  if (protocol.study === "negotiation-r20") return prepareRC20Protocol(protocol.selection);
  if (protocol.study === "negotiation-r19") return prepareRC19Protocol(protocol.selection);
  if (protocol.study === "negotiation-r18") return prepareRC18Protocol(protocol.selection);
  if (protocol.study === "negotiation-r17") return prepareRC17Protocol(protocol.selection);
  if (protocol.study === "negotiation-r16") return prepareRC16Protocol(protocol.selection);
  if (protocol.study === "negotiation-r15") return prepareRC15Protocol(protocol.selection);
  if (protocol.study === "negotiation-r14") return prepareRC14Protocol(protocol.selection);
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
