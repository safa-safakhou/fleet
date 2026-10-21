import { expect, it } from "vitest";
import { assessNegotiation } from "../../src/negotiation-evaluation.js";
import { designDigest } from "../../src/negotiation-plan.js";
import { type NegotiationBatchResult, prepareNegotiationProtocol } from "../../src/negotiation-run.js";
import { buildNegotiationStatus, type NativeNegotiationRun } from "../../src/negotiation-status.js";
import { evidenceFixture, selections } from "../fixtures/negotiation/evidence.js";

function record(): NativeNegotiationRun {
  const protocol = prepareNegotiationProtocol({ ...selections, settingsDigest: "e".repeat(64), stage: "E3" });
  const f = evidenceFixture(),
    assessment = assessNegotiation(f.cell, f.evidence, f.solo, f.reviews);
  const batch: NegotiationBatchResult = {
    schemaVersion: "fleet.negotiation-batch.v1",
    protocolDigest: protocol.digest,
    batchNonce: protocol.batchNonce,
    status: "stopped",
    cells: protocol.cells.map((c) => ({ cellId: c.id, status: "not_started" })),
  };
  batch.cells[0] = { cellId: assessment.cell.id, status: "completed", assessment };
  return {
    protocol,
    batch,
    approvedGrantDigest: "f".repeat(64),
    nonceRecord: {
      protocolDigest: protocol.digest,
      grantDigest: "f".repeat(64),
      resultDigest: designDigest(batch),
      status: "stopped",
    },
  };
}
it("source acceptance cannot invent any real-provider stage or behavioral qualification", () => {
  const s = buildNegotiationStatus(true);
  expect(s.sourceGate).toBe("pass");
  expect(s.modelQualityQualified).toBe(false);
  expect(Object.values(s.realStages).every((x) => x.state === "not_started")).toBe(true);
  expect(buildNegotiationStatus(false).sourceGate).toBe("fail");
});
it("fake-provider outputs and unmatched native nonce/results cannot become real run records", () => {
  const r = record();
  expect(() => buildNegotiationStatus(true, [r])).toThrow();
  r.batch.cells[0].assessment!.evidenceLevel = "real-provider";
  expect(() => buildNegotiationStatus(true, [r])).toThrow();
  r.nonceRecord.resultDigest = designDigest(r.batch);
  const s = buildNegotiationStatus(true, [r]);
  expect(s.realStages.E3.state).toBe("partial");
  expect(s.modelQualityQualified).toBe(false);
  expect(() => buildNegotiationStatus(true, [r, r])).toThrow();
});
it("private text or inconsistent approval metadata is rejected instead of copied into status", () => {
  expect(() => buildNegotiationStatus(true, [Object.assign(record(), { rawText: "private" })])).toThrow(
    "PRIVATE_OR_UNKNOWN_RUN_FIELD",
  );
  const r = record();
  r.nonceRecord.grantDigest = "0".repeat(64);
  expect(() => buildNegotiationStatus(true, [r])).toThrow();
});

it("a stopped native batch without an assessment is attempted, not unstarted or qualified", () => {
  const r = record();
  r.batch.cells[0] = { cellId: r.batch.cells[0].cellId, status: "failed", reason: "CUTOFF" };
  r.nonceRecord.resultDigest = designDigest(r.batch);
  const stage = buildNegotiationStatus(true, [r]).realStages.E3;
  expect(stage.state).toBe("partial");
  expect(stage.assignedCells).toBe(35);
  expect(stage.assessedCells).toBe(0);
  expect(stage.behaviorGate).toBe("stopped");
});
it("assessment success cannot contradict the native cell terminal status", () => {
  const r = record();
  r.batch.cells[0].assessment!.evidenceLevel = "real-provider";
  r.batch.cells[0].status = "failed";
  r.nonceRecord.resultDigest = designDigest(r.batch);
  expect(() => buildNegotiationStatus(true, [r])).toThrow("NATIVE_CELL_STATUS_MISMATCH");
});

it("E3 and E4 cannot qualify different model or policy arms as one candidate", () => {
  const a = record(),
    b = record();
  const protocol = prepareNegotiationProtocol({
    ...b.protocol.selection,
    stage: "E4",
    modelDigest: "9".repeat(64),
    batchNonce: undefined,
  });
  b.protocol = protocol;
  b.batch = {
    schemaVersion: "fleet.negotiation-batch.v1",
    protocolDigest: protocol.digest,
    batchNonce: protocol.batchNonce,
    status: "stopped",
    cells: protocol.cells.map((c) => ({ cellId: c.id, status: "not_started" })),
  };
  b.nonceRecord = { ...b.nonceRecord, protocolDigest: protocol.digest, resultDigest: designDigest(b.batch) };
  a.batch.cells[0].assessment!.evidenceLevel = "real-provider";
  a.nonceRecord.resultDigest = designDigest(a.batch);
  expect(() => buildNegotiationStatus(true, [a, b])).toThrow("MIXED_QUALIFICATION_ARM");
});
