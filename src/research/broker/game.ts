import { FleetError } from "../../domain.js";
import type { ActionIntent, Observation, Proposal } from "../../platform/contracts.js";
import type { ScopedServices } from "../../platform/engine-context.js";
import { canonical } from "../contracts.js";
import type { DecisionProposal } from "./server.js";

const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
/** Only choose from delivered native quotes; never infer prices, claims or authority. */
export function pactOptions(observation: Observation) {
  return (observation.coordination?.focuses ?? []).flatMap((f) => {
    const options = object(f.observation).options;
    return Array.isArray(options) ? options.map(object) : [];
  });
}
export async function validateBrokerAction(
  services: ScopedServices,
  observation: Observation,
  taskId: string,
  intent: ActionIntent,
  proposal: DecisionProposal,
) {
  if (!services.environment.schemas.actions.includes(intent.schemaId)) throw new FleetError("UNSUPPORTED_SCHEMA", true);
  let native: Proposal = {
    taskId,
    intent,
    evidenceRefs: proposal.sourceRefs,
    expectedOutcome: {},
    claims: [],
    conflicts: [],
  };
  if (observation.coordination) {
    const option = pactOptions(observation).find((o) => canonical(o.payload) === canonical(intent.payload));
    if (!option) throw new FleetError("COORDINATION_CHOICE_NOT_DELIVERED", true);
    native = {
      ...native,
      evidenceFrameRef: observation.coordination.evidenceFrameRef,
      evidenceRefs: option.sourceRefs as string[],
      expectedOutcome: object(option.expectedOutcome),
      claims: option.claims as Proposal["claims"],
    };
  }
  if (intent.schemaId === "pact.action.v1" && !services.environment.validateProposal)
    throw new FleetError("PACT_VALIDATION_REQUIRED", true);
  if (services.environment.validateProposal) {
    const validation = await services.environment.validateProposal(native, observation);
    if (!validation.valid) throw new FleetError(validation.code, true);
  }
  return native.intent;
}
