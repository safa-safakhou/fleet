CREATE TABLE IF NOT EXISTS research_metric_snapshots (
 id uuid PRIMARY KEY,run_snapshot_id uuid NOT NULL REFERENCES research_snapshots(id) ON DELETE CASCADE,
 run_id text NOT NULL REFERENCES research_runs(run_id),session_hash text NOT NULL,consent_version bigint NOT NULL,digest text NOT NULL,
 scope jsonb NOT NULL,artifact_ref jsonb NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS research_metric_snapshot_run ON research_metric_snapshots(run_id,created_at);
