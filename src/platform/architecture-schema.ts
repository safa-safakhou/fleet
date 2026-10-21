import { z } from "zod";

const identifier = z.string().min(1).max(100),
  version = z.string().min(1).max(40);
export const ArchitectureRefSchema = z.object({ id: identifier, version }).strict();
const moduleRef = z.object({ id: identifier, version }).strict();
const capabilities = z
  .object({
    eventDelivery: z
      .array(z.enum(["native", "poll"]))
      .min(1)
      .max(2)
      .optional(),
    timing: z
      .array(z.enum(["turn", "realtime"]))
      .min(1)
      .max(2)
      .optional(),
    nativeIdempotency: z.boolean().optional(),
    outcomeLookup: z.boolean().optional(),
    parallelReasoning: z.boolean().optional(),
    social: z.boolean().optional(),
    simulationControls: z.boolean().optional(),
    continuity: z.boolean().optional(),
    coordination: z.boolean().optional(),
    actionEffects: z.boolean().optional(),
  })
  .strict();
export const ArchitectureManifestSchema = z
  .object({
    schemaVersion: z.literal("fleet.architecture-manifest.v1"),
    ref: ArchitectureRefSchema,
    name: z.string().min(1).max(100),
    description: z.string().min(1).max(2000),
    configSchema: z.record(z.string(), z.unknown()),
    defaults: z.record(z.string(), z.unknown()),
    presets: z
      .array(
        z
          .object({ id: identifier, name: z.string().min(1).max(100), config: z.record(z.string(), z.unknown()) })
          .strict(),
      )
      .max(20),
    requirements: z
      .object({
        capabilities,
        schemas: z
          .object({
            observations: z.array(identifier).max(100).optional(),
            actions: z.array(identifier).max(100).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    triggers: z
      .array(z.enum(["periodic", "event", "deadline", "internal-message"]))
      .min(1)
      .max(4),
    executionModes: z
      .array(z.enum(["serial", "sibling-reasoning"]))
      .min(1)
      .max(2),
    observationOwner: z.enum(["host", "engine"]),
    modules: z.array(moduleRef).max(20),
    stateCodecs: z.array(moduleRef).max(20),
    skillModes: z
      .array(z.enum(["off", "advisory", "qualified"]))
      .min(1)
      .max(3),
    form: z
      .object({
        fields: z
          .array(
            z
              .object({
                path: z.string().max(200),
                label: z.string().max(100),
                widget: z.enum(["object", "string", "number", "enum", "boolean", "array"]),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
  })
  .strict();
