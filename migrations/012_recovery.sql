-- Prospective only: historical decisions are never implicitly reviewed or resumed.
CREATE TABLE IF NOT EXISTS recovery_operations (
 turn_id uuid PRIMARY KEY REFERENCES turns(id), agent_id uuid NOT NULL REFERENCES agents(id),
 cohort_id uuid NOT NULL REFERENCES cohorts(id), phase text NOT NULL DEFAULT 'observing',
 status text NOT NULL DEFAULT 'executing' CHECK(status IN('executing','retry','reconcile','owner','complete')),
 code text, failed_phase text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz,
 lease_owner text, lease_until timestamptz, updated_at timestamptz NOT NULL,
 policy text NOT NULL DEFAULT 'scoped-recovery-v1'
);
ALTER TABLE recovery_operations ADD COLUMN IF NOT EXISTS failed_phase text;
CREATE INDEX IF NOT EXISTS recovery_operations_due ON recovery_operations(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS worker_health (
 id text PRIMARY KEY, updated_at timestamptz NOT NULL, dispatch_ready boolean NOT NULL,
 reason text NOT NULL, last_progress_at timestamptz
);
CREATE TABLE IF NOT EXISTS maintenance_holds (
 id uuid PRIMARY KEY, cohort_id uuid NOT NULL REFERENCES cohorts(id), owner text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, released_at timestamptz
);
ALTER TABLE compute_ledger DROP CONSTRAINT IF EXISTS compute_ledger_status_check;
ALTER TABLE compute_ledger ADD CONSTRAINT compute_ledger_status_check CHECK(status IN('reserved','reported','unknown','not_dispatched'));

CREATE TABLE IF NOT EXISTS credential_recovery_jobs (
 agent_id uuid PRIMARY KEY REFERENCES agents(id), attempt_id uuid NOT NULL,
 status text NOT NULL, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_observations (
 allocation_id uuid NOT NULL REFERENCES compute_ledger(id), input_tokens bigint NOT NULL, output_tokens bigint NOT NULL,
 observed_at timestamptz NOT NULL, PRIMARY KEY(allocation_id,input_tokens,output_tokens)
);

CREATE TABLE IF NOT EXISTS agent_blockers (
 agent_id uuid NOT NULL REFERENCES agents(id), kind text NOT NULL, reason text NOT NULL,
 updated_at timestamptz NOT NULL, PRIMARY KEY(agent_id,kind)
);

ALTER TABLE command_resolutions DROP CONSTRAINT IF EXISTS command_resolutions_source_check;
ALTER TABLE command_resolutions ADD CONSTRAINT command_resolutions_source_check CHECK(source IN('receipt','explicit_rejection','operator_review','not_dispatched'));
