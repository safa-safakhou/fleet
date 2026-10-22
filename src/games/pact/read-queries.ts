import type { Data } from "../../domain.js";

/** Names come from the current authenticated catalog, never a static capability grant. */
export function pactReadQuerySchema(names: string[] | undefined, continuity: boolean): Data {
  const name = names ? { type: "string", enum: names } : { type: "string", minLength: 1 };
  const flags = continuity ? { continuity: { const: true }, coordination: { const: true } } : {};
  const dependencies = continuity ? { coordination: ["continuity"] } : {};
  return {
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
}
