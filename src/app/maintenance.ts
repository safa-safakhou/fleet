import { MaintenanceRegistry } from "../platform/maintenance.js";
import type { Store } from "../store.js";
export function createMaintenance(store: Store) {
  const registry = new MaintenanceRegistry();
  registry.register({
    id: "research-snapshots",
    run: async (limit, signal) => {
      if (signal.aborted) return 0;
      const result = await store.pool.query(
        "DELETE FROM research_snapshots WHERE id IN (SELECT s.id FROM research_snapshots s JOIN research_runs r ON r.run_id=s.run_id JOIN cohorts c ON c.id=r.cohort_id WHERE s.expires_at<=$1 OR NOT c.observation_consent OR s.consent_version<>c.observation_consent_version ORDER BY s.created_at LIMIT $2)",
        [store.now(), limit],
      );
      return result.rowCount ?? 0;
    },
  });
  registry.register({
    id: "research-private-artifacts",
    run: async (_limit, signal) => {
      if (signal.aborted || !store.observation) return 0;
      await store.observation.expire();
      return 1;
    },
  });
  for (const [table, column, time] of [
    ["specialist_deliveries", "detail_cipher", "received_at"],
    ["specialist_outbox", "payload_cipher", "created_at"],
    ["specialist_wakes", "condition_cipher", "created_at"],
    ["specialist_claims", "claims_cipher", "created_at"],
    ["specialist_intents", "effects_cipher", "created_at"],
    ["specialist_conflicts", "detail_cipher", "updated_at"],
    ["specialist_conflict_revisions", "detail_cipher", "created_at"],
    ["specialist_planning_intents", "detail_cipher", "created_at"],
    ["skill_invocations", "detail_cipher", "started_at"],
    ["skill_checkpoints", "detail_cipher", "updated_at"],
    ["skill_evaluations", "detail_cipher", "created_at"],
  ])
    registry.register({
      id: `${table}-private`,
      run: async (limit, signal) => {
        if (signal.aborted) return 0;
        const result = await store.pool.query(
          `UPDATE ${table} SET ${column}=NULL WHERE ctid IN(SELECT ctid FROM ${table} WHERE ${column} IS NOT NULL AND ${time}<$1 ORDER BY ${time} LIMIT $2)`,
          [new Date(store.now().getTime() - 30 * 86400000), limit],
        );
        return result.rowCount ?? 0;
      },
    });
  const tables = [
    ["environment_event_receipts", "received_at"],
    ["environment_event_gaps", "observed_at"],
    ["turn_events", "occurred_at"],
    ["communications", "occurred_at"],
    ["cognitive_episodes", "occurred_at"],
    ["cognitive_states", "updated_at"],
    ["cognitive_updates", "recorded_at"],
    ["continuity_states", "updated_at"],
    ["continuity_updates", "recorded_at"],
    ["decision_states", "updated_at"],
    ["architecture_scoped_state", "updated_at"],
    ["architecture_scoped_evidence", "created_at"],
    ["specialist_updates", "created_at"],
    ["decision_choices", "created_at"],
    ["operator_sessions", "expires_at"],
    ["oauth_attempts", "expires_at"],
  ] as const;
  registry.register({
    id: "skill-private-content",
    run: async (limit, signal) => {
      if (signal.aborted) return 0;
      const rows = await store.pool.query(
        "UPDATE skill_versions SET body_cipher=NULL,summary_cipher=NULL,status='suspended' WHERE ctid IN(SELECT ctid FROM skill_versions WHERE (body_cipher IS NOT NULL OR summary_cipher IS NOT NULL) AND created_at<$1 ORDER BY created_at LIMIT $2)",
        [new Date(store.now().getTime() - 30 * 86400000), limit],
      );
      return rows.rowCount ?? 0;
    },
  });
  registry.register({
    id: "specialist-private-state",
    run: async (limit, signal) => {
      if (signal.aborted) return 0;
      const result = await store.pool.query(
        "UPDATE specialist_states SET state_cipher=NULL,support_ids='{}',version=version+1 WHERE ctid IN(SELECT ctid FROM specialist_states WHERE state_cipher IS NOT NULL AND updated_at<$1 ORDER BY updated_at LIMIT $2)",
        [new Date(store.now().getTime() - 30 * 86400000), limit],
      );
      return result.rowCount ?? 0;
    },
  });
  for (const [table, column] of tables)
    registry.register({
      id: table,
      run: async (limit, signal) => {
        if (signal.aborted) return 0;
        const before = new Date(
          store.now().getTime() - (["operator_sessions", "oauth_attempts"].includes(table) ? 0 : 30 * 86400000),
        );
        const result = await store.pool.query(
          `DELETE FROM ${table} WHERE ctid IN(SELECT ctid FROM ${table} WHERE ${column}<$1 ORDER BY ${column} LIMIT $2)`,
          [before, limit],
        );
        return result.rowCount ?? 0;
      },
    });
  // Both fields share one bounded agent scan, preserving fresh sibling content.
  registry.register({
    id: "agent-private-content",
    run: async (limit, signal) => {
      if (signal.aborted) return 0;
      const result = await store.pool.query(
        `UPDATE agents SET
 read_memory_cipher=CASE WHEN read_memory_updated_at<$1 THEN NULL ELSE read_memory_cipher END,
 read_memory_updated_at=CASE WHEN read_memory_updated_at<$1 THEN NULL ELSE read_memory_updated_at END,
 decision_feedback_cipher=CASE WHEN decision_feedback_at<$1 THEN NULL ELSE decision_feedback_cipher END,
 decision_feedback_at=CASE WHEN decision_feedback_at<$1 THEN NULL ELSE decision_feedback_at END
 WHERE ctid IN(SELECT ctid FROM agents WHERE read_memory_updated_at<$1 OR decision_feedback_at<$1
 ORDER BY LEAST(read_memory_updated_at,decision_feedback_at),id LIMIT $2)`,
        [new Date(store.now().getTime() - 30 * 86400000), limit],
      );
      return result.rowCount ?? 0;
    },
  });
  return registry;
}
