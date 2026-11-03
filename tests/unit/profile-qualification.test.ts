import { expect, it } from "vitest";
import { canPromoteCapacity, settledTurnDisposition } from "../../src/research/orchestration/qualification.js";

const scope = "a".repeat(64),
  requirements = [
    { profile: "reactive@1", phases: ["decision"] },
    { profile: "coordinator@1", phases: ["worker", "coordinator"] },
  ];
const sample = (profile: string, bindingId: string, phases: string[]) => ({
  scope,
  profile,
  bindingId,
  phases,
  capacity: 2,
  settled: true,
  outcome: "complete",
  longestCallMs: 15000,
  callLimitMs: 35000,
  usageKnown: true,
  evidenceComplete: true,
  elapsedMs: 50000,
  turnLimitMs: 120000,
});
const samples = [
  sample("reactive@1", "r1", ["decision"]),
  sample("reactive@1", "r2", ["decision"]),
  sample("coordinator@1", "c1", ["worker", "coordinator"]),
  sample("coordinator@1", "c2", ["worker", "coordinator"]),
];
it("only qualifies a higher-capacity trial after full phase coverage from two distinct replicas per profile", () => {
  expect(
    canPromoteCapacity({
      scope,
      current: 2,
      next: 4,
      requirements,
      samples,
      memoryAvailability: 60,
      providerWaiting: 0,
      preemptions: 0,
    }),
  ).toBe(true);
});
it("rejects wait-only extrapolation, duplicate replicas, old instance scope, unknown usage and resource pressure", () => {
  const base = {
    scope,
    current: 2,
    next: 4,
    requirements,
    samples,
    memoryAvailability: 60,
    providerWaiting: 0,
    preemptions: 0,
  };
  for (const bad of [
    samples.slice(0, 2),
    [...samples.slice(0, 3), samples[2]],
    samples.map((x) => ({ ...x, scope: "b".repeat(64) })),
    samples.map((x) => ({ ...x, usageKnown: false })),
    samples.map((x) => (x.profile === "coordinator@1" ? { ...x, phases: ["worker"] } : x)),
  ])
    expect(canPromoteCapacity({ ...base, samples: bad })).toBe(false);
  expect(canPromoteCapacity({ ...base, samples: [...samples, { ...samples[0], outcome: "failed" }] })).toBe(false);
  expect(canPromoteCapacity({ ...base, providerWaiting: 1 })).toBe(false);
  expect(canPromoteCapacity({ ...base, preemptions: 1 })).toBe(false);
});
it("treats accounted completed deadline deferrals as completed outcomes, without granting permission to replay", () => {
  const turn = {
    state: "finished",
    ownerPhase: "completed",
    pendingCommand: null,
    unknownUsage: false,
    code: "MODEL_ADMISSION_DEFERRED",
  };
  expect(settledTurnDisposition(turn)).toBe("completed_deferral");
  expect(settledTurnDisposition({ ...turn, pendingCommand: "synthetic" })).toBe("review");
  expect(settledTurnDisposition({ ...turn, unknownUsage: true })).toBe("review");
  expect(settledTurnDisposition({ ...turn, ownerPhase: "awaiting_reconciliation" })).toBe("review");
});
