import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { CompletenessManifest, EvidenceEvent } from "./types.js";
export class CoverageService {
  constructor(readonly store: Store) {}
  async reconcile(runId: string, maximumOrdinal?: string): Promise<CompletenessManifest> {
    const run = (
      await this.store.pool.query(
        "SELECT r.*,c.observation_consent FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (!run) throw new FleetError("EVIDENCE_RUN_NOT_FOUND", true);
    const events = (
      await this.store.pool.query("SELECT event FROM research_events WHERE run_id=$1 AND ordinal<=$2::bigint", [
        runId,
        maximumOrdinal ?? run.next_ordinal,
      ])
    ).rows.map((r) => r.event as EvidenceEvent);
    const turns = (
      await this.store.pool.query("SELECT DISTINCT turn_id FROM research_evidence_scopes WHERE run_id=$1", [runId])
    ).rows.map((r) => r.turn_id);
    const calls = (
      await this.store.pool.query("SELECT id,status FROM compute_ledger WHERE turn_id=ANY($1::uuid[])", [turns])
    ).rows;
    const commands = (
      await this.store.pool.query(
        "SELECT command_id,state FROM platform_commands WHERE turn_id=ANY($1::uuid[]) UNION SELECT command_id,'confirmed' state FROM command_resolutions WHERE turn_id=ANY($1::uuid[]) AND command_id NOT IN (SELECT command_id FROM platform_commands)",
        [turns],
      )
    ).rows;
    const missing: CompletenessManifest["missing"] = [];
    let expected = 0,
      recorded = 0;
    const require = (kind: string, id: string, key: "allocationId" | "commandId", alternatives: string[] = [kind]) => {
      expected++;
      if (events.some((e) => alternatives.includes(e.kind) && e.attributes[key] === id)) recorded++;
      else missing.push({ kind, sourceId: id });
    };
    for (const call of calls) {
      require("model.request", call.id, "allocationId");
      if (!["reserved", "not_dispatched"].includes(call.status)) require("model.dispatched", call.id, "allocationId");
      if (call.status !== "reserved")
        require("model.response", call.id, "allocationId", ["model.response", "model.failed"]);
      if (call.status === "unknown") missing.push({ kind: "usage.unknown", sourceId: call.id });
    }
    for (const command of commands) {
      require("command.prepared", command.command_id, "commandId");
      if (command.state !== "prepared")
        require("command.result", command.command_id, "commandId", ["command.result", "command.receipt"]);
    }
    const ids = new Set(events.map((e) => e.id));
    for (const event of events)
      for (const parent of event.parentIds)
        if (!ids.has(parent)) missing.push({ kind: "causal.parent", sourceId: parent });
    const expired = new Date(run.expires_at) <= this.store.now();
    const reasons = [
      ...new Set(
        events.flatMap((e) => (e.coverage.status === "complete" ? [] : [...e.coverage.reasons, e.coverage.status])),
      ),
    ];
    if (run.capture_failed) reasons.push("CAPTURE_FAILED");
    if (missing.length) reasons.push("MISSING_REQUIRED_EVIDENCE");
    const status = !run.observation_consent
      ? "withheld"
      : expired
        ? "expired"
        : missing.length || reasons.length
          ? "partial"
          : "complete";
    return {
      version: "fleet.coverage/v1",
      runId,
      status,
      expected,
      recorded,
      missing,
      eventCount: events.length,
      byteCoverage: { expected: "0", recorded: "0", status: status === "complete" ? "complete" : status },
      reasons,
    };
  }
}
