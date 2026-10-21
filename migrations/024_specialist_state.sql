CREATE TABLE IF NOT EXISTS specialist_instances (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 profile_id text NOT NULL CHECK(profile_id='autonomous-specialists'),profile_version text NOT NULL CHECK(profile_version='1'),
 created_at timestamptz NOT NULL,PRIMARY KEY(instance_id,binding_id)
);
CREATE TABLE IF NOT EXISTS specialist_states (
 instance_id text NOT NULL,binding_id uuid NOT NULL,specialist_id text NOT NULL,
 charter_revision integer NOT NULL CHECK(charter_revision>0),charter_cipher text NOT NULL,
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),state_cipher text,support_ids uuid[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL,
 PRIMARY KEY(instance_id,binding_id,specialist_id),FOREIGN KEY(instance_id,binding_id) REFERENCES specialist_instances ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS specialist_goals (
 instance_id text NOT NULL,binding_id uuid NOT NULL,specialist_id text NOT NULL,goal_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN('active','suspended','completed','abandoned')),updated_at timestamptz NOT NULL,
 PRIMARY KEY(instance_id,binding_id,specialist_id,goal_id),FOREIGN KEY(instance_id,binding_id,specialist_id) REFERENCES specialist_states ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS specialist_updates (
 instance_id text NOT NULL,binding_id uuid NOT NULL,specialist_id text NOT NULL,operation_id uuid NOT NULL,
 digest text NOT NULL,version integer NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(instance_id,binding_id,specialist_id,operation_id),FOREIGN KEY(instance_id,binding_id,specialist_id) REFERENCES specialist_states ON DELETE CASCADE
);
CREATE OR REPLACE FUNCTION redact_specialist_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE specialist_states SET state_cipher=NULL,support_ids='{}',version=version+1
 WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND OLD.id=ANY(support_ids);
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS specialist_source_deleted ON architecture_scoped_evidence;
CREATE TRIGGER specialist_source_deleted AFTER DELETE ON architecture_scoped_evidence FOR EACH ROW EXECUTE FUNCTION redact_specialist_source();
