import { type Data, FleetError, object } from "../../domain.js";
import type { Observation } from "../../platform/contracts.js";
import { compactFacts } from "./adapter.js";
import { compactEnvironment } from "./environment.js";
import { fitNegotiationState, type NegotiationState } from "./negotiation-state.js";

/** PACT owns which facts are essential; generic engines must never delete world keys. */
export function packPactObservation(observation: Observation, byteLimit: number): Observation {
  if (observation.schemaId === "pact.observation.negotiation.v1") {
    const { negotiation, requestedRead } = observation.payload;
    const compact: Data = compactFacts(observation.payload),
      world = object(observation.payload.world),
      guide = object(observation.payload.guide);
    const keys = [
      "profile",
      "ambition",
      "ownerIntentStatus",
      "asOfGameTimeMs",
      "balances",
      "authority",
      "mandate",
      "socialDelegation",
      "coldContactStock",
      "communicationCapacity",
    ];
    const environment = Object.fromEntries(keys.filter((k) => compact[k] !== undefined).map((k) => [k, compact[k]]));
    // The trusted candidate policy is a negotiation view. Other game detail is
    // available by ordinary scoped reads; omitted construction is never absence.
    environment.contacts = guide.contacts;
    environment.contactRequests = guide.contactRequests;
    environment.publicDiscovery = observation.payload.discovery;
    environment.socialAttention = {
      ...object(observation.payload.socialAttention),
      records: (Array.isArray(object(observation.payload.socialAttention).records)
        ? (object(observation.payload.socialAttention).records as unknown[])
        : []
      ).filter((r) => !["SupplyOffer", "SupplyContract"].includes(String(object(r).type))),
    };
    const base: Observation = {
      ...observation,
      payload: { environment, ...(requestedRead === undefined ? {} : { requestedRead }), negotiation: null },
      coverage: {
        ...observation.coverage,
        packed: true,
        policy: "pact.negotiation-view.v1",
        omitted: ["construction, military and full guide/rule detail; use normal scoped reads"],
        time: world.asOfGameTimeMs,
      },
    };
    const bytes = () => Buffer.byteLength(JSON.stringify(base));
    if (bytes() > byteLimit - 1000) {
      delete environment.publicDiscovery;
      (base.coverage.omitted as string[]).push("discovery page unavailable; use scoped discovery read");
    }
    const fitted = fitNegotiationState(negotiation as NegotiationState, byteLimit - bytes() - 32);
    base.payload.negotiation = fitted.state;
    if (Buffer.byteLength(JSON.stringify(base)) > byteLimit) throw new FleetError("CONTEXT_LIMIT", true);
    return base;
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
