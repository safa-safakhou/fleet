import { type Data, safeCode } from "../../domain.js";
import { validateTool } from "../../tools.js";
import { pactAdapter } from "./adapter.js";
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
