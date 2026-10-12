CREATE TABLE IF NOT EXISTS turn_events (
 id uuid PRIMARY KEY,
 sequence bigint GENERATED ALWAYS AS IDENTITY,
 turn_id uuid NOT NULL REFERENCES turns(id),
 agent_id uuid NOT NULL REFERENCES agents(id),
 cohort_id uuid NOT NULL REFERENCES cohorts(id),
 occurred_at timestamptz NOT NULL,
 stage text NOT NULL,
 label text NOT NULL,
 detail_cipher text
);
CREATE INDEX IF NOT EXISTS turn_events_timeline ON turn_events(turn_id,sequence);
CREATE INDEX IF NOT EXISTS turn_events_retention ON turn_events(occurred_at);
CREATE INDEX IF NOT EXISTS turn_events_consent ON turn_events(cohort_id);
CREATE INDEX IF NOT EXISTS compute_ledger_turn_usage ON compute_ledger(turn_id);
CREATE INDEX IF NOT EXISTS turns_agent_history ON turns(agent_id,started_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS turns_cohort_history ON turns(cohort_id,started_at DESC,id DESC);
