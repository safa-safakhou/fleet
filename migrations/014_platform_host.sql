CREATE TABLE IF NOT EXISTS cohort_engine_profiles (
 cohort_id uuid PRIMARY KEY REFERENCES cohorts(id), profile_id text NOT NULL, profile_version text NOT NULL,
 timed_reviews boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS platform_admission_ticket;
CREATE TABLE IF NOT EXISTS platform_cohort_admission (cohort_id uuid PRIMARY KEY REFERENCES cohorts(id),last_ticket bigint NOT NULL);
CREATE TABLE IF NOT EXISTS platform_tasks (
 id uuid PRIMARY KEY, binding_id uuid NOT NULL REFERENCES environment_bindings(id), cohort_id uuid NOT NULL REFERENCES cohorts(id),
 profile_id text NOT NULL, profile_version text NOT NULL, task_key text NOT NULL CHECK(length(task_key) BETWEEN 1 AND 200),
 state text NOT NULL DEFAULT 'ready' CHECK(state IN('ready','running','waiting','completed','blocked','cancelled')),
 owner_priority integer NOT NULL DEFAULT 0 CHECK(owner_priority BETWEEN -100 AND 100), deadline jsonb, deadline_at timestamptz,
 due_at timestamptz NOT NULL, wake jsonb, code text, revision bigint NOT NULL DEFAULT 1,fence bigint NOT NULL DEFAULT 0,
 active_turn_id uuid REFERENCES turns(id), created_at timestamptz NOT NULL, sequence bigserial NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_task_key ON platform_tasks(binding_id,task_key) WHERE state IN('ready','running','waiting','blocked');
CREATE TABLE IF NOT EXISTS platform_task_sources (
 binding_id uuid NOT NULL REFERENCES environment_bindings(id), event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 2000),
 task_id uuid NOT NULL REFERENCES platform_tasks(id), source_ref text NOT NULL CHECK(length(source_ref) BETWEEN 1 AND 8000),
 observed_at timestamptz NOT NULL, sequence bigserial NOT NULL, PRIMARY KEY(binding_id,event_id)
);
CREATE TABLE IF NOT EXISTS platform_task_claims (
 turn_id uuid PRIMARY KEY REFERENCES turns(id),task_id uuid NOT NULL REFERENCES platform_tasks(id),
 fence bigint NOT NULL,revision bigint NOT NULL,profile_id text NOT NULL,profile_version text NOT NULL,created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS environment_cursors (binding_id uuid PRIMARY KEY REFERENCES environment_bindings(id),cursor text,updated_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS model_capacity_routes (route_key text PRIMARY KEY,capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 16));
CREATE TABLE IF NOT EXISTS model_capacity_leases (
 id uuid PRIMARY KEY,route_key text NOT NULL REFERENCES model_capacity_routes(route_key),turn_id uuid NOT NULL UNIQUE REFERENCES turns(id),
 state text NOT NULL CHECK(state IN('queued','active')),expires_at timestamptz NOT NULL,sequence bigserial NOT NULL
);
CREATE TABLE IF NOT EXISTS platform_commands (
 command_id uuid PRIMARY KEY,turn_id uuid NOT NULL REFERENCES turns(id),task_id uuid NOT NULL REFERENCES platform_tasks(id),
 binding_id uuid NOT NULL REFERENCES environment_bindings(id),intent_cipher text NOT NULL,
 state text NOT NULL CHECK(state IN('prepared','dispatched','confirmed','rejected','pending','unknown')),
 outcome jsonb,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_tasks_ready ON platform_tasks(state,due_at,cohort_id);
CREATE INDEX IF NOT EXISTS platform_sources_task ON platform_task_sources(task_id,sequence);
CREATE INDEX IF NOT EXISTS platform_commands_turn ON platform_commands(turn_id,created_at);
CREATE INDEX IF NOT EXISTS model_capacity_queue ON model_capacity_leases(route_key,state,sequence);
