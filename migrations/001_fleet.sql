CREATE TABLE IF NOT EXISTS cohorts (
 id uuid PRIMARY KEY, name text NOT NULL, count integer NOT NULL CHECK(count BETWEEN 1 AND 1000),
 interval_minutes integer NOT NULL CHECK(interval_minutes IN(10,15,30,60)), seed text NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','paused','running','stopped','finished')),
 model jsonb, budget jsonb, generation bigint NOT NULL DEFAULT 0,
 anchor_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 observation_consent boolean NOT NULL DEFAULT false, synthetic_owner_policy jsonb
);
CREATE TABLE IF NOT EXISTS agents (
 id uuid PRIMARY KEY, cohort_id uuid NOT NULL REFERENCES cohorts(id), ordinal integer NOT NULL,
 name text NOT NULL, strategy jsonb NOT NULL,
 account_id uuid UNIQUE, kingdom_id uuid UNIQUE,
 state text NOT NULL DEFAULT 'unconnected' CHECK(state IN('unconnected','ready','paused','needs_owner','stopped')),
 next_due_at timestamptz, last_turn_at timestamptz, notes text NOT NULL DEFAULT '',
 reason text, fence bigint NOT NULL DEFAULT 0, secret_cipher text,
 credential_state text NOT NULL DEFAULT 'empty', failure_count integer NOT NULL DEFAULT 0,
 UNIQUE(cohort_id,ordinal)
);
CREATE TABLE IF NOT EXISTS turns (
 id uuid PRIMARY KEY, agent_id uuid NOT NULL REFERENCES agents(id), cohort_id uuid NOT NULL REFERENCES cohorts(id),
 generation bigint NOT NULL, fence bigint NOT NULL, worker text NOT NULL,
 state text NOT NULL CHECK(state IN('running','finished','pending','needs_owner','cancelled')),
 due_at timestamptz NOT NULL, started_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL,
 finished_at timestamptz, code text, calls integer NOT NULL DEFAULT 0, actions integer NOT NULL DEFAULT 0,
 pending_command uuid, pending_action jsonb, summary text, input_tokens bigint NOT NULL DEFAULT 0,
 output_tokens bigint NOT NULL DEFAULT 0, unknown_usage boolean NOT NULL DEFAULT false,
 CHECK ((pending_command IS NULL) = (pending_action IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_turn ON turns(agent_id) WHERE state IN('running','pending');
CREATE TABLE IF NOT EXISTS compute_ledger (
 id uuid PRIMARY KEY, cohort_id uuid NOT NULL REFERENCES cohorts(id), turn_id uuid NOT NULL REFERENCES turns(id),
 period text NOT NULL, tokens bigint NOT NULL, created_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','reported','unknown')),
 input_tokens bigint, output_tokens bigint
);
CREATE TABLE IF NOT EXISTS communications (
 id uuid PRIMARY KEY, cohort_id uuid NOT NULL REFERENCES cohorts(id), owner_agent_id uuid NOT NULL REFERENCES agents(id),
 peer_kingdom_id text NOT NULL, source_id text NOT NULL, kind text NOT NULL, direction text NOT NULL,
 occurred_at timestamptz NOT NULL, game_time text, body_cipher text NOT NULL,
 UNIQUE(owner_agent_id,kind,source_id)
);
CREATE INDEX IF NOT EXISTS communication_pair ON communications(cohort_id,owner_agent_id,peer_kingdom_id,occurred_at,id);
CREATE TABLE IF NOT EXISTS worker_heartbeats (id text PRIMARY KEY, updated_at timestamptz NOT NULL, live_enabled boolean NOT NULL);
CREATE TABLE IF NOT EXISTS operator_sessions (hash text PRIMARY KEY, expires_at timestamptz NOT NULL, csrf text NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id bigserial PRIMARY KEY, cohort_id uuid REFERENCES cohorts(id), kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_attempts (state text PRIMARY KEY,agent_id uuid NOT NULL REFERENCES agents(id),operator_session text NOT NULL,secret_cipher text NOT NULL,expires_at timestamptz NOT NULL,phase text NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS owner_decisions (command_id uuid PRIMARY KEY,agent_id uuid NOT NULL REFERENCES agents(id),action_hash text NOT NULL,state text NOT NULL DEFAULT 'reserved',created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE agents ADD COLUMN IF NOT EXISTS read_memory_cipher text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS read_memory_updated_at timestamptz;
