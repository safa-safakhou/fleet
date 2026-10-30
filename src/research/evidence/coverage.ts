import type { PoolClient } from "pg";
import { FleetError } from "../../domain.js";
import type { Store } from "../../store.js";
import type { CompletenessManifest } from "./types.js";
export class CoverageService {
  constructor(readonly store: Store) {}
  async reconcile(
    runId: string,
    maximumOrdinal?: string,
    db: Pick<PoolClient, "query"> = this.store.pool,
  ): Promise<CompletenessManifest> {
    const run = (
      await db.query(
        "SELECT r.*,c.observation_consent,c.observation_consent_version::text consent_version FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (!run) throw new FleetError("EVIDENCE_RUN_NOT_FOUND", true);
    const bound = [runId, maximumOrdinal ?? run.next_ordinal];
    const eventCount = (
      await db.query("SELECT count(*)::int n FROM research_events WHERE run_id=$1 AND ordinal<=$2::bigint", bound)
    ).rows[0].n;
    // Fetch only native join keys; full-history counts/reasons/parent reconciliation stay in SQL.
    const events = (
      await db.query(
        "SELECT event->>'kind' kind,event->'attributes' attributes FROM research_events WHERE run_id=$1 AND ordinal<=$2::bigint AND (event->'attributes' ? 'allocationId' OR event->'attributes' ? 'commandId')",
        bound,
      )
    ).rows as { kind: string; attributes: Record<string, string> }[];
    const turns = (
      await db.query("SELECT DISTINCT turn_id FROM research_evidence_scopes WHERE run_id=$1", [runId])
    ).rows.map((r) => r.turn_id);
    const calls = (await db.query("SELECT id,status FROM compute_ledger WHERE turn_id=ANY($1::uuid[])", [turns])).rows;
    const commands = (
      await db.query(
        "SELECT command_id,state FROM platform_commands WHERE turn_id=ANY($1::uuid[]) UNION SELECT command_id,'confirmed' state FROM command_resolutions WHERE turn_id=ANY($1::uuid[]) AND command_id NOT IN (SELECT command_id FROM platform_commands) UNION SELECT pending_command command_id,'pending' state FROM turns WHERE id=ANY($1::uuid[]) AND pending_command IS NOT NULL AND pending_command NOT IN (SELECT command_id FROM platform_commands) AND pending_command NOT IN (SELECT command_id FROM command_resolutions)",
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
    const parents = (
      await db.query(
        `SELECT DISTINCT p.value id FROM research_events e CROSS JOIN LATERAL jsonb_array_elements_text(e.event->'parentIds') p(value) LEFT JOIN research_events parent ON parent.id=p.value::uuid AND parent.run_id=e.run_id AND parent.ordinal<=$2::bigint WHERE e.run_id=$1 AND e.ordinal<=$2::bigint AND parent.id IS NULL`,
        bound,
      )
    ).rows;
    for (const parent of parents) missing.push({ kind: "causal.parent", sourceId: parent.id });
    const expired = new Date(run.expires_at) <= this.store.now();
    const reasons = (
      await db.query(
        `WITH gaps AS (SELECT event->'coverage' c FROM research_events WHERE run_id=$1 AND ordinal<=$2::bigint AND event->'coverage'->>'status'<>'complete') SELECT DISTINCT jsonb_array_elements_text(c->'reasons') reason FROM gaps UNION SELECT DISTINCT c->>'status' reason FROM gaps`,
        bound,
      )
    ).rows.map((r) => r.reason as string);
    if (run.capture_failed) reasons.push("CAPTURE_FAILED");
    if (missing.length) reasons.push("MISSING_REQUIRED_EVIDENCE");
    const artifacts = (
      await db.query(
        "SELECT a.id,a.expected_bytes::text,a.bytes::text,a.status,a.consent_version::text,EXISTS(SELECT 1 FROM research_events e,jsonb_array_elements(e.event->'artifacts') ref WHERE e.run_id=a.run_id AND e.ordinal<=$2::bigint AND ref->>'id'=a.id::text) linked FROM research_artifacts a WHERE a.run_id=$1",
        bound,
      )
    ).rows;
    let expectedBytes = 0n,
      recordedBytes = 0n;
    for (const artifact of artifacts) {
      if (!artifact.linked) missing.push({ kind: "artifact.unlinked", sourceId: artifact.id });
      if (artifact.status !== "complete") missing.push({ kind: `artifact.${artifact.status}`, sourceId: artifact.id });
      if (artifact.expected_bytes === null) reasons.push("BYTE_EXPECTATION_UNAVAILABLE");
      else expectedBytes += BigInt(artifact.expected_bytes);
      if (artifact.consent_version !== run.consent_version) reasons.push("ARTIFACT_WITHHELD");
      else if (artifact.status === "complete") recordedBytes += BigInt(artifact.bytes);
      else reasons.push(`ARTIFACT_${artifact.status.toUpperCase()}`);
    }
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
      eventCount,
      byteCoverage: {
        expected: String(expectedBytes),
        recorded: String(recordedBytes),
        status: status === "complete" ? "complete" : status,
      },
      reasons,
    };
  }
}
