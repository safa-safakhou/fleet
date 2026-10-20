ALTER TABLE cohort_engine_profiles ADD COLUMN IF NOT EXISTS architecture_config jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS architecture_launch_drafts (
 id uuid PRIMARY KEY,spec jsonb NOT NULL,digest text NOT NULL,revision integer NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','started')),cohort_id uuid REFERENCES cohorts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS architecture_launch_requests (
 request_id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN('draft','start')),payload_digest text NOT NULL,
 result jsonb NOT NULL,created_at timestamptz NOT NULL
);
