import { type Data, object, safeCode } from "../../domain.js";
import { executableActionSchema } from "../../generation.js";
import { validateTool } from "../../tools.js";
import { pactAdapter } from "./adapter.js";

/** Generation constraints describe conditional choices, never permission. */
export function pactActionContracts(facts: Data) {
  const available = pactAdapter.availableActions?.(facts, null);
  const version = object(object(facts.guide).mandate).version;
  const mandate = Number.isSafeInteger(version) && Number(version) >= 0 ? { const: version } : undefined;
  const exact = (available?.schemas ?? []).map((schema) => {
    const shape = executableActionSchema(schema),
      properties = object(shape.properties);
    if (properties.mandateVersion) {
      if (mandate) properties.mandateVersion = mandate;
      else delete properties.mandateVersion;
    }
    return shape;
  });
  const detailed = new Set(exact.map((s) => object(object(s.properties).kind).const));
  const remaining = [...new Set(available?.kinds ?? [])].filter((kind) => !detailed.has(kind));
  const variants: Data[] = [...exact];
  if (remaining.length)
    variants.push({
      type: "object",
      properties: {
        kind: { type: "string", enum: remaining },
        ...(mandate ? { mandateVersion: mandate } : { mandateVersion: { not: {} } }),
      },
      required: ["kind"],
      additionalProperties: true,
    });
  return variants.length ? [{ schemaId: "pact.action.v1", payloadSchema: { anyOf: variants } }] : [];
}
/** Pure local shape/reference check only. Never grants authority or opens a lease. */
export function validatePactProposal(payload: Data, facts: Data): { valid: boolean; code: string } {
  try {
    validateTool({ name: "pact.action.v1", inputSchema: pactAdapter.actionSchema(String(payload.kind)) }, payload);
    const denied = pactAdapter.preflight?.(payload, facts);
    return denied ? { valid: false, code: String(denied.code) } : { valid: true, code: "VALID" };
  } catch (error) {
    return { valid: false, code: safeCode(error) };
  }
}

export function pactProposalGuide(facts: Data): Data {
  return {
    schemaId: "pact.action.v1",
    payload:
      "A bare action object with kind and its exact arguments directly in payload. Fleet assigns commandId outside payload; do not nest another action/command envelope. Only a concrete supported kind is executable; intended outcomes are not action kinds.",
    upfrontSchemas: pactAdapter.availableActions?.(facts, null)?.schemas ?? [],
    coverage:
      "Shapes are conditional advertisements, never authority; current server permissions and prerequisites still apply.",
  };
}
