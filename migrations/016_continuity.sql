-- New profile namespace; no legacy cognition or cohort backfill.
CREATE TABLE IF NOT EXISTS continuity_states (
 binding_id uuid PRIMARY KEY REFERENCES environment_bindings(id) ON DELETE CASCADE,
 cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
 namespace text NOT NULL CHECK(namespace='reactive-cognition@1'),
 version integer NOT NULL CHECK(version>0),
 updated_at timestamptz NOT NULL,
 detail_cipher text NOT NULL
);
CREATE TABLE IF NOT EXISTS continuity_updates (
 turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
 expected_version integer NOT NULL,
 cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
 recorded_at timestamptz NOT NULL,
 update_digest text NOT NULL,
 version integer NOT NULL,
 PRIMARY KEY(turn_id,expected_version)
);
