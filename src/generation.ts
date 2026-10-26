import { type Data, decisionSchema, FleetError, object, type Tool } from "./domain.js";

function inline(schema: Data): Data {
  if (schema.$schema && !String(schema.$schema).includes("draft-07/schema")) throw new FleetError("SCHEMA_CHANGED");
  const walk = (value: unknown, chain: string[] = []): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v, chain));
    if (!value || typeof value !== "object") return value;
    const node = object(value);
    if (typeof node.$ref === "string") {
      const ref = node.$ref;
      if (!ref.startsWith("#/") || chain.includes(ref)) throw new FleetError("SCHEMA_CHANGED");
      const target = ref
        .slice(2)
        .split("/")
        .reduce<unknown>((v, key) => object(v)[key.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
      if (!target || typeof target !== "object") throw new FleetError("SCHEMA_CHANGED");
      const { $ref: _ref, ...rest } = node;
      return { ...object(walk(target, [...chain, ref])), ...object(walk(rest, chain)) };
    }
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !["$schema", "$defs", "definitions"].includes(key))
        .map(([key, v]) => [key, walk(v, chain)]),
    );
  };
  const keywords = new Set([
    "type",
    "properties",
    "required",
    "additionalProperties",
    "const",
    "enum",
    "anyOf",
    "oneOf",
    "allOf",
    "not",
    "if",
    "then",
    "else",
    "items",
    "additionalItems",
    "contains",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "format",
    "patternProperties",
    "propertyNames",
    "minProperties",
    "maxProperties",
    "dependencies",
    "default",
  ]);
  const project = (node: unknown): unknown => {
    if (typeof node === "boolean") return node;
    const result: Data = {};
    for (const [key, value] of Object.entries(object(node))) {
      if (!keywords.has(key)) continue; // Unknown JSON Schema keywords are annotations, not assertions.
      result[key] = ["properties", "patternProperties"].includes(key)
        ? Object.fromEntries(Object.entries(object(value)).map(([name, shape]) => [name, project(shape)]))
        : ["anyOf", "oneOf", "allOf"].includes(key) && Array.isArray(value)
          ? value.map(project)
          : [
                "not",
                "if",
                "then",
                "else",
                "items",
                "additionalItems",
                "contains",
                "propertyNames",
                "additionalProperties",
              ].includes(key) && typeof value === "object"
            ? Array.isArray(value)
              ? value.map(project)
              : project(value)
            : value;
    }
    return result;
  };
  return object(project(walk(schema)));
}
function argsShape(schema: Data): Data {
  const shape = inline(schema);
  if (shape.type !== "object") throw new FleetError("SCHEMA_CHANGED");
  return { ...shape, additionalProperties: false };
}
export function executableActionSchema(schema: Data): Data {
  const shape = argsShape(schema);
  if (typeof object(object(shape.properties).kind).const !== "string") throw new FleetError("SCHEMA_CHANGED");
  return { ...shape, required: [...new Set([...(Array.isArray(shape.required) ? shape.required : []), "kind"])] };
}
export function closedDecisionSchema(input: {
  actionKinds: string[];
  actionSchemas: Data[];
  reads: Tool[];
  selectedReadNames: string[];
  memory: boolean;
  continuationLookup?: boolean;
  continuationSchema?: Data;
  waitSchema?: Data;
}): Data {
  const base = object(inline(decisionSchema)),
    branches = (base.oneOf ?? base.anyOf) as Data[];
  const branch = (kind: string) => branches.find((b) => object(object(b.properties).kind).const === kind) ?? {};
  const wait = branch("wait"),
    read = branch("read"),
    action = branch("action");
  if (input.waitSchema) {
    object(wait.properties).basis = input.waitSchema;
    wait.required = [...new Set([...(wait.required as string[]), "basis"])];
  } else delete object(wait.properties).basis;
  const readNames = [...new Set(input.reads.map((t) => t.name))];
  const lookupNames = readNames.filter((name) => !input.selectedReadNames.includes(name));
  const local: Tool[] = [
    ...(input.continuationLookup
      ? [
          {
            name: "fleet_continuation_schema",
            inputSchema: {
              type: "object",
              properties: {
                section: { enum: ["continuation", ...(input.memory ? ["cognitive_plan", "cognitive_memories"] : [])] },
              },
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(input.actionKinds.length
      ? [
          {
            name: "fleet_action_schema",
            inputSchema: {
              type: "object",
              properties: { kind: { enum: input.actionKinds } },
              required: ["kind"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(lookupNames.length
      ? [
          {
            name: "fleet_read_schema",
            inputSchema: {
              type: "object",
              properties: { name: { enum: lookupNames } },
              required: ["name"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(input.memory
      ? [
          {
            name: "fleet_memory_recall",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string", minLength: 1, maxLength: 240 } },
              required: ["query"],
              additionalProperties: false,
            },
          },
        ]
      : []),
  ];
  const selected = new Set(input.selectedReadNames);
  // Share the read envelope without widening any tool/argument pair.
  // Repeating summary/notes/closure for every advertised schema is pure overhead.
  const readTools = [...input.reads.filter((t) => selected.has(t.name)), ...local];
  // Grammar converters may choose anyOf before reading its sibling properties/required.
  // Each alternative must therefore carry the complete closed read envelope.
  const variants: Data[] = [
    wait,
    ...readTools.map((t) => ({
      ...read,
      properties: {
        ...object(read.properties),
        kind: { const: "read" },
        tool: { const: t.name },
        args: argsShape(t.inputSchema),
      },
    })),
  ];
  const actions = input.actionSchemas
    .map(executableActionSchema)
    .filter((s) => input.actionKinds.includes(String(object(object(s.properties).kind).const)));
  if (actions.length)
    variants.push({ ...action, properties: { ...object(action.properties), action: { anyOf: actions } } });
  if (input.continuationSchema)
    for (const variant of variants)
      object(variant.properties).continuation = { $ref: "#/definitions/fleetContinuation" };
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    anyOf: variants,
    ...(input.continuationSchema ? { definitions: { fleetContinuation: input.continuationSchema } } : {}),
  };
}
export function bindGenerationSchema(schema: Data, closed: Data): Data {
  const result = structuredClone(schema);
  if (!object(result.properties).decision) throw new FleetError("SCHEMA_CHANGED");
  const { $schema: _dialect, definitions: closedDefinitions, ...inner } = closed;
  if (closedDefinitions) result.definitions = { ...object(result.definitions), ...object(closedDefinitions) };
  object(result.properties).decision = inner;
  // Remove unreachable legacy decision definitions. Cognition source IDs remain
  // constrained by the delivered evidence, independently of operation targets.
  for (const key of ["definitions", "$defs"]) {
    const defs = object(result[key]),
      retained = new Set<string>();
    const collect = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        for (const n of v) collect(n);
        return;
      }
      const o = object(v),
        ref = o.$ref;
      if (typeof ref === "string" && ref.startsWith(`#/${key}/`)) {
        const name = ref.slice(key.length + 3).split("/")[0];
        if (!retained.has(name)) {
          retained.add(name);
          collect(defs[name]);
        }
      }
      for (const [k, n] of Object.entries(o)) if (!["definitions", "$defs"].includes(k)) collect(n);
    };
    collect(result);
    if (Object.keys(defs).length) result[key] = Object.fromEntries([...retained].map((n) => [n, defs[n]]));
  }
  return result;
}
