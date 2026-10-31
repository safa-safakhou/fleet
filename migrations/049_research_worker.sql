ALTER TABLE research_steps ADD COLUMN IF NOT EXISTS kind text CHECK(kind IN ('model','read','proposal','port'));
CREATE TABLE IF NOT EXISTS research_worker_sessions (
 id uuid PRIMARY KEY,token_hash text NOT NULL UNIQUE,operation_id text NOT NULL REFERENCES research_operations(operation_id),
 scope jsonb NOT NULL,role_id text NOT NULL,authority text NOT NULL CHECK(authority IN ('actor','advisory')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','fenced','acknowledged')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL,stopped_at timestamptz,acknowledged_at timestamptz
);
CREATE TABLE IF NOT EXISTS research_worker_checkpoints (
 id uuid PRIMARY KEY,operation_id text NOT NULL REFERENCES research_operations(operation_id),version bigint NOT NULL,
 scope jsonb NOT NULL,worker_version text NOT NULL,policy_version text NOT NULL,metadata jsonb NOT NULL,state_ref jsonb NOT NULL,
 created_at timestamptz NOT NULL,UNIQUE(operation_id,version)
);
