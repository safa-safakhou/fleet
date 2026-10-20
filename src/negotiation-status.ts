import { type NegotiationAssessment, summarizeNegotiation } from "./negotiation-evaluation.js";
import { designDigest, negotiationPlan } from "./negotiation-plan.js";
import type { NegotiationBatchResult, ProtocolPreview } from "./negotiation-run.js";
import { prepareNegotiationProtocol } from "./negotiation-run.js";
export type NativeNegotiationRun = {
  protocol: ProtocolPreview;
  batch: NegotiationBatchResult;
  approvedGrantDigest: string;
  nonceRecord: { protocolDigest: string; grantDigest: string; resultDigest: string; status: string };
  nativeTimingVerified?: boolean;
};
/** Derive publication state from native batch results plus separately read terminal
 * nonce metadata. Bare/fake assessments and unmatched self-reports are not runs.
 * Private grants, keys, messages and raw traces are never copied into this result.
 */
export function buildNegotiationStatus(sourcePassed: boolean, runs: NativeNegotiationRun[] = []) {
  const stages = new Set<string>(),
    nonces = new Set<string>(),
    worlds = new Set<string>(),
    cellIds = new Set<string>();
  const byStage = new Map<string, NegotiationAssessment[]>();
  for (const run of runs) {
    if (
      Object.keys(run).some(
        (k) => !["protocol", "batch", "approvedGrantDigest", "nonceRecord", "nativeTimingVerified"].includes(k),
      )
    )
      throw Error("PRIVATE_OR_UNKNOWN_RUN_FIELD");
    const { protocol, batch, nonceRecord } = run;
    if (
      !/^[a-f0-9]{64}$/.test(run.approvedGrantDigest) ||
      designDigest(prepareNegotiationProtocol(protocol.selection)) !== designDigest(protocol) ||
      batch.protocolDigest !== protocol.digest ||
      batch.batchNonce !== protocol.batchNonce ||
      nonceRecord.protocolDigest !== protocol.digest ||
      nonceRecord.grantDigest !== run.approvedGrantDigest ||
      nonceRecord.resultDigest !== designDigest(batch) ||
      nonceRecord.status !== batch.status
    )
      throw Error("NATIVE_NEGOTIATION_RECORD_MISMATCH");
    if (nonces.has(batch.batchNonce)) throw Error("DUPLICATE_NATIVE_BATCH");
    nonces.add(batch.batchNonce);
    if (stages.has(protocol.selection.stage)) throw Error("DUPLICATE_NATIVE_STAGE");
    stages.add(protocol.selection.stage);
    const planned = negotiationPlan(protocol.selection.stage, {
      sources: protocol.selection.sources,
      modelDigest: protocol.selection.modelDigest,
      policyDigest: protocol.selection.policyDigest,
      selectedProfile: protocol.selection.selectedProfile,
    });
    if (
      batch.cells.length !== planned.length ||
      new Set(batch.cells.map((c) => c.cellId)).size !== planned.length ||
      planned.some((c) => !batch.cells.some((result) => result.cellId === c.id))
    )
      throw Error("NATIVE_BATCH_CELL_SET_MISMATCH");
    for (const cell of batch.cells) {
      if (!cell.assessment) {
        if (cell.status === "completed") throw Error("MISSING_NATIVE_ASSESSMENT");
        continue;
      }
      const a = cell.assessment,
        original = planned.find((c) => c.id === cell.cellId);
      if (
        a.evidenceLevel !== "real-provider" ||
        !original ||
        designDigest(original) !== designDigest(a.cell) ||
        a.cell.id !== cell.cellId ||
        a.cost.allocations < 1
      )
        throw Error("REAL_NATIVE_ASSESSMENT_REQUIRED");
      if ((cell.status === "completed") !== (a.status === "pass") || cell.status === "not_started")
        throw Error("NATIVE_CELL_STATUS_MISMATCH");
      if (worlds.has(a.worldId) || cellIds.has(a.cell.id)) throw Error("DUPLICATE_NATIVE_WORLD_OR_CELL");
      worlds.add(a.worldId);
      cellIds.add(a.cell.id);
      const list = byStage.get(a.cell.stage) ?? [];
      list.push(a);
      byStage.set(a.cell.stage, list);
    }
  }
  const realStages = Object.fromEntries(
    (["E1", "E2", "E3", "E4"] as const).map((stage) => {
      const rows = byStage.get(stage) ?? [],
        record = runs.find((r) => r.protocol.selection.stage === stage);
      if (!record)
        return [
          stage,
          {
            state: "not_started",
            assignedCells: 0,
            assessedCells: 0,
            reportedAllocations: 0,
            behaviorGate: "unstarted",
          },
        ];
      const expected = record.protocol.cells.length,
        complete = rows.length === expected;
      const behaviorGate =
        record.batch.status === "stopped"
          ? "stopped"
          : !complete
            ? "incomplete"
            : stage === "E1"
              ? "diagnostic_only"
              : stage === "E2"
                ? "comparison_only"
                : stage === "E4" &&
                    !runs
                      .filter((r) => r.protocol.selection.stage === stage)
                      .every((r) => r.nativeTimingVerified === true)
                  ? "native_timing_unverified"
                  : summarizeNegotiation(rows).gate;
      return [
        stage,
        {
          state: complete ? "recorded" : "partial",
          assignedCells: expected,
          assessedCells: rows.length,
          reportedAllocations: rows.reduce((n, a) => n + a.cost.allocations, 0),
          behaviorGate,
        },
      ];
    }),
  ) as Record<
    "E1" | "E2" | "E3" | "E4",
    { state: string; assignedCells: number; assessedCells: number; reportedAllocations: number; behaviorGate: string }
  >;
  return {
    schemaVersion: "fleet.negotiation-status.v1",
    sourceGate: sourcePassed ? "pass" : "fail",
    modelQualityQualified:
      sourcePassed && realStages.E3.behaviorGate === "pass" && realStages.E4.behaviorGate === "pass",
    realStages,
    realRunRecordDigests: runs.map((r) => designDigest(r.batch)),
  };
}
