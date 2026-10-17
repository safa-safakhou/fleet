CREATE TABLE IF NOT EXISTS cohort_wake_policies (
 cohort_id uuid PRIMARY KEY REFERENCES cohorts(id), policy jsonb NOT NULL,created_at timestamptz NOT NULL
);
ALTER TABLE environment_cursors ADD COLUMN IF NOT EXISTS next_review_at timestamptz;
ALTER TABLE environment_cursors ADD COLUMN IF NOT EXISTS next_poll_at timestamptz;
CREATE TABLE IF NOT EXISTS environment_event_gaps (
 id uuid PRIMARY KEY,binding_id uuid NOT NULL REFERENCES environment_bindings(id),observed_at timestamptz NOT NULL,
 snapshot_revision text NOT NULL,snapshot_source_refs jsonb NOT NULL,delivery text NOT NULL
);
CREATE TABLE IF NOT EXISTS environment_event_receipts (
 binding_id uuid NOT NULL REFERENCES environment_bindings(id),event_id text NOT NULL,
 received_at timestamptz NOT NULL,disposition text NOT NULL,
 PRIMARY KEY(binding_id,event_id)
);
