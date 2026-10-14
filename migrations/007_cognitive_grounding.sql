-- A result can yield one reflection, even after it leaves the visible last eight.
-- Expiry/eviction of the source also expires its deduplication key. No prose here.
CREATE TABLE IF NOT EXISTS cognitive_reflection_keys (
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES cognitive_episodes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(agent_id,outcome_id)
);
