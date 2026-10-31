import type { PolicyInput } from "../../../src/research/workers/statechart.js";
export const policyInput: PolicyInput = {
  eventRef: "fixture:construction:1",
  nowUtc: "2026-10-31T10:00:00.000Z",
  maxObservationAgeMs: 5000,
  clock: { clockId: "pact.game-time-ms", value: "1000", paused: false },
  deadline: { clockId: "pact.game-time-ms", value: "2000" },
  authority: "actor",
  observation: {
    schemaId: "pact.observation.v1",
    revision: "r1",
    observedAt: "2026-10-31T10:00:00.000Z",
    environmentTime: { clockId: "pact.game-time-ms", value: "1000" },
    sourceRefs: ["fixture:stock"],
    payload: {},
    coverage: {},
  },
  candidate: {
    kind: "action",
    payload: { schemaId: "pact.action.v1", payload: { kind: "queue_build", building: "farm" } },
    sourceRefs: ["fixture:stock"],
    preconditions: {},
  },
};
