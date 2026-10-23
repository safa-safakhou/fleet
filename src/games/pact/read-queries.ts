import type { Data, Tool } from "../../domain.js";
import { knownReadArgumentContract, knownReadArgumentContractV3 } from "../../platform/contracts.js";

/** Names come from the current authenticated catalog, never a static capability grant. */
export function pactReadQuerySchema(
  names: string[] | undefined,
  continuity: boolean,
  argumentTools?: Pick<Tool, "name" | "inputSchema">[],
  emptyArgumentNames: string[] = [],
  contractVersion?: 3,
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
  const separateOutlook = contractVersion === 3;
  const ordinaryEmpty = separateOutlook ? emptyNames.filter((n) => n !== "pact_agent_outlook_v1") : emptyNames;
  const outlookEmpty = separateOutlook && emptyNames.includes("pact_agent_outlook_v1");
  return {
    ...schema,
    $comment: separateOutlook ? knownReadArgumentContractV3 : knownReadArgumentContract,
    description: separateOutlook
      ? "{} refreshes; readSchema inspects metadata only. Fields need schema lookup; {} args use native defaults. Outlook OR continuity per query."
      : "{} refreshes. {readSchema:name} inspects metadata, not game state. Empty native defaults are exact; field-bearing args need lookup.",
    oneOf: [
      choices[0],
      ...(ordinaryEmpty.length
        ? [
            {
              type: "object",
              properties: {
                tool: { enum: ordinaryEmpty },
                args: { type: "object", properties: {}, additionalProperties: false },
                ...flags,
              },
              dependencies,
              required: ["tool", "args"],
              additionalProperties: false,
            },
          ]
        : []),
      ...(outlookEmpty
        ? [
            {
              type: "object",
              properties: {
                tool: { const: "pact_agent_outlook_v1" },
                args: { type: "object", properties: {}, additionalProperties: false },
              },
              required: ["tool", "args"],
              additionalProperties: false,
            },
          ]
        : []),
      ...argumentTools
        .filter((t) => names?.includes(t.name))
        .map((t) => ({
          type: "object",
          properties: {
            tool: { const: t.name },
            args: portableArguments(t.inputSchema),
            ...(separateOutlook && t.name === "pact_agent_outlook_v1" ? {} : flags),
          },
          dependencies: separateOutlook && t.name === "pact_agent_outlook_v1" ? {} : dependencies,
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
