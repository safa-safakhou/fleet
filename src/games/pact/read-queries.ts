import type { Data, Tool } from "../../domain.js";
import { knownReadArgumentContract } from "../../platform/contracts.js";

/** Names come from the current authenticated catalog, never a static capability grant. */
export function pactReadQuerySchema(
  names: string[] | undefined,
  continuity: boolean,
  argumentTools?: Pick<Tool, "name" | "inputSchema">[],
  emptyArgumentNames: string[] = [],
): Data {
  const name = names ? { type: "string", enum: names } : { type: "string", minLength: 1 };
  const flags = continuity ? { continuity: { const: true }, coordination: { const: true } } : {};
  const dependencies = continuity ? { coordination: ["continuity"] } : {};
  const schema: Data = {
    description:
      "Read-only query: {} refreshes the authorized view. Use {readSchema:name} to obtain one advertised tool's exact argument schema, then {tool:name,args:{...}} to read it. Names are capabilities, not grants; existing authorization still applies. Reads send no messages and change no game state. Missing facts remain unknown.",
    oneOf: [
      { type: "object", properties: flags, dependencies, additionalProperties: false },
      ...(names?.length === 0
        ? []
        : [
            {
              type: "object",
              properties: { tool: name, args: { type: "object", additionalProperties: true }, ...flags },
              dependencies,
              required: ["tool", "args"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: { readSchema: name },
              required: ["readSchema"],
              additionalProperties: false,
            },
          ]),
    ],
  };
  if (argumentTools === undefined) return schema;
  const choices = schema.oneOf as Data[];
  const emptyNames = emptyArgumentNames.filter((n) => names?.includes(n) && !argumentTools.some((t) => t.name === n));
  return {
    ...schema,
    $comment: knownReadArgumentContract,
    description:
      "{} refreshes. {readSchema:name} inspects metadata, not game state. Empty native defaults are exact; field-bearing args need lookup.",
    oneOf: [
      choices[0],
      ...(emptyNames.length
        ? [
            {
              type: "object",
              properties: {
                tool: { enum: emptyNames },
                args: { type: "object", properties: {}, additionalProperties: false },
                ...flags,
              },
              dependencies,
              required: ["tool", "args"],
              additionalProperties: false,
            },
          ]
        : []),
      ...argumentTools
        .filter((t) => names?.includes(t.name))
        .map((t) => ({
          type: "object",
          properties: { tool: { const: t.name }, args: portableArguments(t.inputSchema), ...flags },
          dependencies,
          required: ["tool", "args"],
          additionalProperties: false,
        })),
      ...(names?.length === 0 ? [] : [choices[choices.length - 1]]),
    ],
  };
}
/** Canonical native schemas remain untouched. Numeric digit patterns use native-converter syntax. */
function portableArguments(schema: Data): Data {
  const result = structuredClone(schema);
  delete result.$schema;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (["const", "enum", "default", "examples"].includes(key)) continue;
      if (key === "pattern" && typeof child === "string" && child === "^\\d+$") (value as Data)[key] = "^[0-9]+$";
      else visit(child);
    }
  };
  visit(result);
  return result;
}
