CREATE TABLE IF NOT EXISTS decision_choices (
  turn_id uuid PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  policy text NOT NULL CHECK(policy='vw-focus-v1'),
  created_at timestamptz NOT NULL,
  detail_cipher text NOT NULL,
  feedback_cipher text,
  feedback_at timestamptz,
  status text NOT NULL DEFAULT 'awaiting' CHECK(status IN('awaiting','learned','censored'))
);
ALTER TABLE decision_choices ADD COLUMN IF NOT EXISTS sequence bigserial;
CREATE UNIQUE INDEX IF NOT EXISTS decision_choices_sequence ON decision_choices(sequence);
CREATE INDEX IF NOT EXISTS decision_choices_learning ON decision_choices(cohort_id,sequence);
CREATE INDEX IF NOT EXISTS decision_choices_feedback ON decision_choices(agent_id,created_at DESC) WHERE status='awaiting';
