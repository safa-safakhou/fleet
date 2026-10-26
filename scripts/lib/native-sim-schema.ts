import { type Data, object } from "../../src/domain.js";
import type { Observation } from "../../src/platform/contracts.js";

export const choicePayload = (view: Observation, choices?: string[]): Data => ({
  type: "object",
  properties: {
    choice: { type: "string", enum: choices ?? object(view.payload.selection).legal },
    revision: { type: "string", const: view.revision },
    requestId: { type: "string", const: object(view.payload.selection).requestId },
  },
  required: ["choice", "revision", "requestId"],
  additionalProperties: false,
});
/** Refine recognized action/proposal roles, never every field with a matching name. */
export function simulationGenerationSchema(input: Data, view: Observation, choices?: string[]): Data {
  const schema = structuredClone(input),
    payload = choicePayload(view, choices);
  const maps = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
  const nodes = new Set(["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames"]);
  function visit(raw: unknown) {
    if (Array.isArray(raw)) {
      raw.forEach(visit);
      return;
    }
    const item = object(raw),
      props = object(item.properties);
    if (props.payload && (props.schemaId || object(props.kind).const === "action"))
      props.payload = structuredClone(payload);
    if (props.action && object(props.kind).const === "action")
      props.action = {
        type: "object",
        properties: { kind: { const: "sim.choose" }, ...object(payload.properties) },
        required: ["kind", ...(payload.required as string[])],
        additionalProperties: false,
      };
    if (props.intent && props.evidenceRefs) {
      const refs = object(props.evidenceRefs);
      props.evidenceRefs = { ...refs, items: { ...object(refs.items), enum: [...view.sourceRefs] } };
    }
    for (const [key, child] of Object.entries(item)) {
      if (maps.has(key)) Object.values(object(child)).forEach(visit);
      else if (nodes.has(key) || ["allOf", "anyOf", "oneOf", "prefixItems"].includes(key)) visit(child);
    }
  }
  visit(schema);
  return schema;
}
