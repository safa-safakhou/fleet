CREATE TABLE IF NOT EXISTS skill_versions (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 skill_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),digest text NOT NULL,author text NOT NULL,status text NOT NULL CHECK(status IN('candidate','advisory','guarded','suspended','retired')),
 body_cipher text,summary_cipher text,source_ids uuid[] NOT NULL,episode_signature text NOT NULL,procedure_signature text NOT NULL,evaluation_id uuid,published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(instance_id,binding_id,skill_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS skill_candidate_episode ON skill_versions(instance_id,binding_id,author,episode_signature,procedure_signature);
CREATE TABLE IF NOT EXISTS skill_adoptions (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,
 skill_id uuid NOT NULL,version integer NOT NULL,digest text NOT NULL,created_at timestamptz NOT NULL,PRIMARY KEY(instance_id,binding_id,specialist_id,skill_id,version),
 FOREIGN KEY(instance_id,binding_id,skill_id,version) REFERENCES skill_versions(instance_id,binding_id,skill_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS skill_evaluations (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 skill_id uuid NOT NULL,version integer NOT NULL,digest text NOT NULL,policy_version text NOT NULL,dependencies_digest text NOT NULL,eligible_mode text NOT NULL,
 detail_cipher text,created_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION redact_skill_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE skill_versions SET status='suspended',body_cipher=NULL,summary_cipher=NULL,updated_at=clock_timestamp() WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND OLD.id=ANY(source_ids);
 UPDATE skill_evaluations SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS skill_source_deleted ON architecture_scoped_evidence;
CREATE TRIGGER skill_source_deleted AFTER DELETE ON architecture_scoped_evidence FOR EACH ROW EXECUTE FUNCTION redact_skill_source();
