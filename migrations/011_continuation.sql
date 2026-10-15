-- Additive owned encrypted bookkeeping; legacy prose/history is not interpreted or rewritten.
CREATE TABLE IF NOT EXISTS decision_states (
 agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
 cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
 version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL,
 detail_cipher text NOT NULL
);
