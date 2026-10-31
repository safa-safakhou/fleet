import type { RunSnapshot } from "../../../src/research/evidence/inspection.js";
import type { MetricEvidence } from "../../../src/research/metrics/types.js";
export function metricFixture() {
  const start = "2026-10-31T10:00:00.000Z",
    end = "2026-10-31T11:00:00.000Z";
  const allocations = Array.from({ length: 207 }, (_, i) => ({
    id: `call-${i}`,
    status: i < 205 ? "reported" : "unknown",
    purpose: "decision",
    inputTokens: i < 205 ? "10" : null,
    outputTokens: i < 205 ? "5" : null,
    createdAt: start,
    reservedTokens: i < 205 ? "15" : "100",
    requestMetrics: { queueDelayMs: i + 1 },
    responseMetrics: { providerExecutionMs: i < 205 ? i + 1 : null },
  }));
  const snapshot: RunSnapshot = {
    version: "fleet.snapshot/v1",
    id: "00000000-0000-4000-8000-000000000001",
    runId: "fixture-run",
    maximumOrdinal: "210",
    total: 210,
    createdAt: end,
    expiresAt: "2026-10-31T12:00:00.000Z",
    provenance: "research",
    manifestDigest: "a".repeat(64),
    manifest: null,
    manifestAvailability: "unavailable",
    scopes: [],
    native: {
      allocations,
      commands: [{ id: "one", status: "confirmed" }],
      attempts: [{ id: "turn", taskId: "task", startedAt: start, finishedAt: end, actions: 1, code: "WAIT" }],
      cohorts: [
        { id: "a", createdAt: start, completedAt: end },
        { id: "b", createdAt: start, completedAt: start },
      ],
    },
    coverage: {
      version: "fleet.coverage/v1",
      runId: "fixture-run",
      status: "partial",
      expected: 10,
      recorded: 9,
      missing: [],
      eventCount: 210,
      byteCoverage: { expected: "100", recorded: "90", status: "partial" },
      reasons: ["MISSING_EVENT"],
    },
    metricDefinitions: [],
  };
  const measurements: MetricEvidence["measurements"] = [
    {
      id: "objective_success_rate.v1",
      value: null,
      numerator: 1,
      denominator: 2,
      status: "complete" as const,
      ungraded: 1,
    },
    { id: "first_pass_accuracy.v1", value: null, numerator: 3, denominator: 4, status: "complete" },
    { id: "recovery_rate.v1", value: null, numerator: 1, denominator: 2, status: "complete" },
    { id: "duplicate_effect_rate.v1", value: null, numerator: 1, denominator: 3, status: "complete" },
  ].map((v) => ({ ...v, status: "complete" as const, at: start, sourceRefs: ["fixture:independent-rubric"] }));
  return {
    snapshot,
    evidence: {
      snapshotId: snapshot.id,
      events: [],
      measurements,
      unavailableRefs: [],
      sourceRefs: [],
    } as MetricEvidence,
    window: { start, end },
  };
}
