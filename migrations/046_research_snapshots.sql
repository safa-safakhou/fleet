CREATE TABLE IF NOT EXISTS research_snapshots (
 id uuid PRIMARY KEY,
 run_id text NOT NULL REFERENCES research_runs(run_id),
 session_hash text NOT NULL,
 consent_version bigint NOT NULL,
 maximum_ordinal bigint NOT NULL,
 body jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS research_snapshots_run ON research_snapshots(run_id);
