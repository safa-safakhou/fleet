import { Ajv } from "ajv";
import type { z } from "zod";
import { type Data, FleetError } from "../domain.js";
import { ArchitectureManifestSchema, ArchitectureRefSchema } from "./architecture-schema.js";
import type { ScopedEvent, ScopedOperation, ScopedServices } from "./engine-context.js";
export type ArchitectureRef = z.infer<typeof ArchitectureRefSchema>;
export type EngineProfileRef = ArchitectureRef;
export type ArchitectureManifest = z.infer<typeof ArchitectureManifestSchema>;
export type ValidationIssue = { path: string; code: string; detail: string };
export type RecipientSpec = { participantId: string; taskKey: string; subscriptionVersion: string };
export type ArchitectureRuntime = {
  route(event: ScopedEvent): RecipientSpec[];
  run(operation: ScopedOperation): Promise<void>;
};
export type ArchitectureDefinition = {
  manifest: ArchitectureManifest;
  validate(config: Data, launch: Data): ValidationIssue[];
  create(services: ScopedServices): ArchitectureRuntime;
};
export function immutable<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}
export class ArchitectureRegistry {
  private definitions = new Map<string, ArchitectureDefinition>();
  private validators = new Map<string, ReturnType<Ajv["compile"]>>();
  constructor(definitions: ArchitectureDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }
  private key(ref: ArchitectureRef) {
    return JSON.stringify([ref.id, ref.version]);
  }
  register(definition: ArchitectureDefinition) {
    const parsed = ArchitectureManifestSchema.safeParse(definition.manifest);
    if (!parsed.success) throw new FleetError("INVALID_ARCHITECTURE_MANIFEST");
    const manifest = immutable(structuredClone(parsed.data)),
      key = this.key(manifest.ref);
    if (this.definitions.has(key)) throw new FleetError("DUPLICATE_ARCHITECTURE");
    let validate: ReturnType<Ajv["compile"]>;
    try {
      validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(manifest.configSchema);
    } catch {
      throw new FleetError("INVALID_ARCHITECTURE_SCHEMA");
    }
    if (!validate(manifest.defaults) || manifest.presets.some((p) => !validate(p.config)))
      throw new FleetError("INVALID_ARCHITECTURE_DEFAULTS");
    this.definitions.set(key, Object.freeze({ manifest, validate: definition.validate, create: definition.create }));
    this.validators.set(key, validate);
  }
  resolve(raw: ArchitectureRef): ArchitectureDefinition {
    const ref = ArchitectureRefSchema.parse(raw),
      definition = this.definitions.get(this.key(ref));
    if (!definition) throw new FleetError("UNSUPPORTED_ARCHITECTURE");
    return definition;
  }
  list(): ArchitectureManifest[] {
    return [...this.definitions.values()].map((d) => d.manifest);
  }
  validate(ref: ArchitectureRef, config: Data, launch: Data): ValidationIssue[] {
    const definition = this.resolve(ref),
      validate = this.validators.get(this.key(ref));
    if (!validate?.(config))
      return (validate?.errors ?? []).map((e) => ({
        path: e.instancePath || "/",
        code: "INVALID_ARCHITECTURE_CONFIG",
        detail: e.keyword,
      }));
    return definition.validate(config, launch);
  }
}
