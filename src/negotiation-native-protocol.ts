import { FleetError } from "./domain.js";
import { createNegotiationCellGuard } from "./negotiation-guard.js";
import { designDigest, type NegotiationCell } from "./negotiation-plan.js";
import type {
  NegotiationBatchResult,
  NegotiationExecutionPorts,
  NegotiationGrant,
  ProtocolPreview,
} from "./negotiation-run.js";

/** Fixed native hosts have independent clocks and one shared provider/turn lane.
 * Both windows are opened before either host starts. The native composition,
 * not a protocol flag or this orchestration function, supplies normal pacing. */
export async function executeNativeNegotiationProtocol(
  protocol: ProtocolPreview,
  grant: NegotiationGrant,
  cells: NegotiationCell[],
  ports: NegotiationExecutionPorts,
): Promise<NegotiationBatchResult> {
  if (ports.timingMode !== "native" || protocol.selection.stage !== "E4" || cells.length !== 2)
    throw new FleetError("OWNED_NATIVE_SCHEDULER_ACCEPTANCE_REQUIRED", true);
  if (!(await ports.claimNonce(grant.batchNonce, protocol.digest, designDigest(grant))))
    throw new FleetError("NONCE_ALREADY_CONSUMED", true);
  const result: NegotiationBatchResult = {
    schemaVersion: "fleet.negotiation-batch.v1",
    protocolDigest: protocol.digest,
    batchNonce: protocol.batchNonce,
    status: "complete",
    cells: cells.map((c) => ({ cellId: c.id, status: "not_started" })),
  };
  const entries: {
    cell: NegotiationCell;
    index: number;
    binding: NegotiationGrant["bindings"][number];
    cutoff: number;
    controller: AbortController;
    timer: ReturnType<typeof setTimeout>;
    window: { startsAt: string; cutoffAt: string };
  }[] = [];
  const stopAll = () => {
    result.status = "stopped";
    for (const e of entries) e.controller.abort();
  };
  let opening = 0;
  try {
    const started = ports.now();
    if (!Number.isSafeInteger(started) || !Number.isFinite(new Date(started).getTime()))
      throw new FleetError("NEGOTIATION_CLOCK_UNAVAILABLE", true);
    for (const [index, cell] of cells.entries()) {
      const binding = grant.bindings.find((b) => b.cellId === cell.id);
      if (!binding) throw new FleetError("EXACT_CELL_SET_REQUIRED", true);
      const cutoff = Math.min(Date.parse(grant.cutoffAt), started + cell.limits.wallDeadlineMs),
        controller = new AbortController();
      entries.push({
        cell,
        index,
        binding,
        cutoff,
        controller,
        timer: setTimeout(() => controller.abort(), Math.max(1, cutoff - ports.now())),
        window: { startsAt: new Date(started).toISOString(), cutoffAt: new Date(cutoff).toISOString() },
      });
    }
    for (const e of entries) {
      opening = e.index;
      await ports.openCell?.(e.binding, e.window);
    }
    await Promise.all(
      entries.map(async (e) => {
        const { cell, index, binding, controller, cutoff } = e;
        const guard = createNegotiationCellGuard({
          ports,
          protocol,
          grant,
          cell,
          binding,
          controller,
          cutoff,
          onOperationalFailure: stopAll,
        });
        try {
          await guard({ phase: "action", actorId: binding.actorIds[0] });
          const assessment = await ports.runCell(cell, binding, { ...e.window, signal: controller.signal, guard });
          if (
            designDigest(assessment.cell) !== designDigest(cell) ||
            assessment.worldId !== binding.worldId ||
            assessment.evidenceLevel !== "real-provider"
          )
            throw new FleetError("NEGOTIATION_RESULT_SCOPE", true);
          result.cells[index] = {
            cellId: cell.id,
            status: assessment.status === "pass" ? "completed" : "failed",
            assessment,
          };
          await guard({ phase: "action", actorId: binding.actorIds[0] });
          const native = await ports.accounting(binding);
          if (
            native.allocations.some((a) => a.status === "unknown" || a.status === "reserved") ||
            native.uncertainCommands.length ||
            !native.ownershipValid ||
            !native.privacyValid ||
            !native.authorityValid ||
            native.duplicateEffects
          )
            throw new FleetError("NEGOTIATION_OPERATIONAL_STOP", true);
          if (assessment.criticalFailures.length) {
            stopAll();
            await ports.closeAdmission(binding, "CRITICAL_CLAIM");
          }
        } catch (error) {
          const reason = error instanceof FleetError ? error.code : "NEGOTIATION_NATIVE_FAILURE";
          result.cells[index] = { ...result.cells[index], cellId: cell.id, status: "failed", reason };
          stopAll();
          await ports.closeAdmission(binding, reason);
        } finally {
          clearTimeout(e.timer);
          controller.abort();
        }
      }),
    );
  } catch (error) {
    const reason = error instanceof FleetError ? error.code : "NEGOTIATION_NATIVE_FAILURE";
    stopAll();
    result.cells[opening] = { ...result.cells[opening], cellId: cells[opening].id, status: "failed", reason };
  } finally {
    for (const e of entries) {
      clearTimeout(e.timer);
      e.controller.abort();
      if (result.status === "stopped") await ports.closeAdmission(e.binding, "BATCH_TERMINAL");
    }
    await ports.finishNonce(grant.batchNonce, result.status, designDigest(result));
  }
  return result;
}
