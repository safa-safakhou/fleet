ALTER TABLE cohort_engine_profiles ADD COLUMN IF NOT EXISTS non_model_limits jsonb;
CREATE TABLE IF NOT EXISTS skill_invocations (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
 skill_id uuid NOT NULL,skill_version integer NOT NULL,skill_digest text NOT NULL,goal_id uuid NOT NULL,trigger_id text NOT NULL,
 state text NOT NULL CHECK(state IN('active','waiting','completed','reason','unknown')),revision integer NOT NULL DEFAULT 0,node_index integer NOT NULL DEFAULT 0,
 effective_limits jsonb NOT NULL,detail_cipher text,reason text,started_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 UNIQUE(instance_id,binding_id,specialist_id,goal_id,trigger_id,skill_id,skill_version,skill_digest)
);
CREATE TABLE IF NOT EXISTS skill_checkpoints (
 invocation_id uuid NOT NULL REFERENCES skill_invocations(id) ON DELETE CASCADE,node_id text NOT NULL,revision integer NOT NULL DEFAULT 0,
 state text NOT NULL CHECK(state IN('prepared','started','waiting','completed','unknown')),command_id uuid,payload_digest text,detail_cipher text,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(invocation_id,node_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS skill_one_goal_version ON skill_invocations(instance_id,binding_id,specialist_id,goal_id,skill_id,skill_version,skill_digest);
CREATE TABLE IF NOT EXISTS skill_invocation_events (
 invocation_id uuid NOT NULL REFERENCES skill_invocations(id) ON DELETE CASCADE,event_id text NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(invocation_id,event_id)
);
CREATE TABLE IF NOT EXISTS skill_work_reservations (
 invocation_id uuid NOT NULL REFERENCES skill_invocations(id) ON DELETE CASCADE,node_id text NOT NULL,kind text NOT NULL CHECK(kind IN('reads','actions','messages','steps','wallTimeMs','recovery_reads')),
 units bigint NOT NULL CHECK(units>=0),actual_units bigint NOT NULL DEFAULT 0 CHECK(actual_units>=0),created_at timestamptz NOT NULL,
 PRIMARY KEY(invocation_id,node_id,kind)
);
CREATE OR REPLACE FUNCTION redact_skill_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE skill_versions SET status='suspended',body_cipher=NULL,summary_cipher=NULL,updated_at=clock_timestamp() WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND OLD.id=ANY(source_ids);
 UPDATE skill_evaluations SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 UPDATE skill_checkpoints SET detail_cipher=NULL WHERE invocation_id IN(SELECT id FROM skill_invocations WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id);
 UPDATE skill_invocations SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 RETURN OLD;
END $$;
