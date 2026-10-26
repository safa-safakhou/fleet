import { Ajv } from "ajv";
import { type Data, FleetError } from "./domain.js";

/** A local contract defect must fail before invoking any provider. */
export function compileGenerationSchema(schema: Data) {
  try {
    return new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(schema);
  } catch {
    throw new FleetError("INVALID_GENERATION_SCHEMA", true);
  }
}

/** Equivalent transport representation for vLLM's auto decoder. Literal values are never schemas. */
export function prepareVllmGenerationSchema(input: Data): Data {
  const maps = new Set(["properties", "patternProperties"]);
  const lists = new Set(["oneOf", "anyOf", "allOf", "prefixItems"]);
  const singles = new Set([
    "items",
    "contains",
    "not",
    "if",
    "then",
    "else",
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "additionalItems",
    "unevaluatedItems",
    "contentSchema",
  ]);
  let nodes = 0;
  const unsupported = (): never => {
    throw new FleetError("PROVIDER_SCHEMA_NOT_SUPPORTED", true);
  };
  const visit = (raw: unknown, refs: string[] = [], depth = 0): unknown => {
    if (++nodes > 100000 || depth > 64) unsupported();
    if (typeof raw === "boolean") return raw;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return structuredClone(raw);
    const node = raw as Data;
    if (typeof node.$ref === "string") {
      const ref = node.$ref;
      if (
        !ref.startsWith("#/") ||
        refs.includes(ref) ||
        Object.keys(node).some((k) => k !== "$ref" && k !== "$defs" && k !== "definitions")
      )
        unsupported();
      let target: unknown = input;
      for (const part of ref.slice(2).split("/")) {
        if (
          !target ||
          typeof target !== "object" ||
          !Object.hasOwn(target, part.replaceAll("~1", "/").replaceAll("~0", "~"))
        )
          unsupported();
        target = (target as Data)[part.replaceAll("~1", "/").replaceAll("~0", "~")];
      }
      return visit(target, [...refs, ref], depth + 1);
    }
    const result: Data = {};
    const dependencies: Data[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (key === "$defs" || key === "definitions") continue;
      if (["dependencies", "dependentRequired", "dependentSchemas"].includes(key)) {
        if (!value || typeof value !== "object" || Array.isArray(value)) unsupported();
        for (const [trigger, dependency] of Object.entries(value as Data)) {
          // A false property schema excludes presence, without the decoder's unsupported `not`.
          // Keywords remain object-only just as in the original dependency contract.
          const condition = Array.isArray(dependency) ? { required: dependency } : visit(dependency, refs, depth + 1);
          if (Array.isArray(dependency) && dependency.some((name) => typeof name !== "string")) unsupported();
          dependencies.push({ anyOf: [{ properties: { [trigger]: false } }, condition] });
        }
        continue;
      }
      if (key === "propertyNames") {
        const constraint = visit(value, refs, depth + 1);
        if (JSON.stringify(constraint) !== '{"type":"string"}') result[key] = constraint;
        continue;
      }
      if (maps.has(key) && value && typeof value === "object" && !Array.isArray(value))
        result[key] = Object.fromEntries(
          Object.entries(value).map(([name, child]) => [name, visit(child, refs, depth + 1)]),
        );
      else if (lists.has(key) && Array.isArray(value))
        result[key] = value.map((child) => visit(child, refs, depth + 1));
      else if (singles.has(key) && value && typeof value === "object") result[key] = visit(value, refs, depth + 1);
      else result[key] = structuredClone(value);
    }
    if (dependencies.length) result.allOf = [...((result.allOf as unknown[]) ?? []), ...dependencies];
    return result;
  };
  const result = visit(input) as Data;
  if (Buffer.byteLength(JSON.stringify(result)) > 64000) unsupported();
  compileGenerationSchema(result);
  return result;
}
