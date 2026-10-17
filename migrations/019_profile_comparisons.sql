-- Configuration links only; existing paired comparisons and cohort ownership remain unchanged.
CREATE TABLE IF NOT EXISTS platform_comparisons (
 id uuid PRIMARY KEY, name text NOT NULL, design text NOT NULL CHECK(design IN('interacting_world','independent_replicas','unspecified')),
 cohort_ids uuid[] NOT NULL, snapshots jsonb NOT NULL, request_digest text NOT NULL, created_at timestamptz NOT NULL
);

ALTER TABLE cohort_engine_profiles ADD COLUMN IF NOT EXISTS environment_ref jsonb;
