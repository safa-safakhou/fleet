CREATE TABLE IF NOT EXISTS command_resolutions (
 command_id uuid PRIMARY KEY,
 turn_id uuid NOT NULL REFERENCES turns(id),
 agent_id uuid NOT NULL REFERENCES agents(id),
 cohort_id uuid NOT NULL REFERENCES cohorts(id),
 resolved_at timestamptz NOT NULL,
 code text NOT NULL,
 source text NOT NULL CHECK(source IN ('receipt','explicit_rejection','operator_review')),
 action_cipher text NOT NULL,
 evidence jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS command_resolutions_turn ON command_resolutions(turn_id);
