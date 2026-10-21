import { MaintenanceRegistry } from "../platform/maintenance.js";
import type { Store } from "../store.js";
export function createMaintenance(store: Store) {
  const registry = new MaintenanceRegistry();
  for (const [table, column, time] of [
    ["specialist_deliveries", "detail_cipher", "received_at"],
    ["specialist_outbox", "payload_cipher", "created_at"],
    ["specialist_wakes", "condition_cipher", "created_at"],
    ["specialist_claims", "claims_cipher", "created_at"],
    ["specialist_intents", "effects_cipher", "created_at"],
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
  for (const [id, column, clear] of [
    ["read-memory", "read_memory_updated_at", "read_memory_cipher=NULL,read_memory_updated_at=NULL"],
    ["decision-feedback", "decision_feedback_at", "decision_feedback_cipher=NULL,decision_feedback_at=NULL"],
  ])
    registry.register({
      id,
      run: async (limit, signal) => {
        if (signal.aborted) return 0;
        const result = await store.pool.query(
          `UPDATE agents SET ${clear} WHERE ctid IN(SELECT ctid FROM agents WHERE ${column}<$1 ORDER BY ${column} LIMIT $2)`,
          [new Date(store.now().getTime() - 30 * 86400000), limit],
        );
        return result.rowCount ?? 0;
      },
    });
  return registry;
}
