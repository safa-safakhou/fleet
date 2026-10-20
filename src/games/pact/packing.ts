import { type Data, FleetError } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import { compactFacts } from "./adapter.js";
import { compactEnvironment } from "./environment.js";
import { fitNegotiationState, type NegotiationState } from "./negotiation-state.js";

/** PACT owns which facts are essential; generic engines must never delete world keys. */
export function packPactObservation(observation: Observation, byteLimit: number): Observation {
  if (observation.schemaId === "pact.observation.negotiation.v1") {
    const { negotiation, ...payload } = observation.payload;
    const protectedState = negotiation as NegotiationState;
    const base = packPactObservation(
      { ...observation, schemaId: "pact.observation.v1", payload },
      byteLimit - Math.min(4000, Math.floor(byteLimit / 2)),
    );
    const allowance = byteLimit - Buffer.byteLength(JSON.stringify(base)) - 32;
    const fitted = fitNegotiationState(protectedState, allowance);
    const result = { ...base, schemaId: observation.schemaId, payload: { ...base.payload, negotiation: fitted.state } };
    if (Buffer.byteLength(JSON.stringify(result)) > byteLimit) throw new FleetError("CONTEXT_LIMIT", true);
    return result;
  }
  const { requestedRead, ...facts } = observation.payload;
  // A requested scoped read is its own answer, not an initial world snapshot.
  if (!facts.world) {
    if (Buffer.byteLength(JSON.stringify(observation)) > byteLimit) throw new FleetError("CONTEXT_LIMIT", true);
    return observation;
  }
  const base = {
    ...observation,
    payload: { ...(requestedRead === undefined ? {} : { requestedRead }) } as Data,
    coverage: { ...observation.coverage, packed: true },
  };
  const overhead = Buffer.byteLength(JSON.stringify(base));
  const environment = compactEnvironment(compactFacts(facts), byteLimit - overhead - 64);
  return { ...base, payload: { ...base.payload, environment } };
}
