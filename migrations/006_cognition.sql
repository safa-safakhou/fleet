CREATE TABLE IF NOT EXISTS cognitive_episodes (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  kind text NOT NULL CHECK(kind IN('observation','message','agreement','receipt','interpretation')),
  detail_cipher text NOT NULL,
  UNIQUE(agent_id,source_key)
);
ALTER TABLE cognitive_episodes ADD COLUMN IF NOT EXISTS sequence bigserial;
CREATE INDEX IF NOT EXISTS cognitive_episodes_recall ON cognitive_episodes(agent_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS cognitive_states (
  agent_id uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  detail_cipher text NOT NULL
);
CREATE TABLE IF NOT EXISTS cognitive_updates (
  turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  decision integer NOT NULL,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL,
  detail_cipher text NOT NULL,
  PRIMARY KEY(turn_id,decision)
);
