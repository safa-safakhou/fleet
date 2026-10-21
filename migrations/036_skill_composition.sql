CREATE TABLE IF NOT EXISTS specialist_goal_routines (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,goal_id uuid NOT NULL,
 goal_digest text NOT NULL,owner_digest text NOT NULL,PRIMARY KEY(instance_id,binding_id,specialist_id,goal_id)
);
CREATE TABLE IF NOT EXISTS specialist_turn_work (
 turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 specialist_id text NOT NULL,work_key text NOT NULL,kind text NOT NULL,units bigint NOT NULL CHECK(units>=0),created_at timestamptz NOT NULL,actual_units bigint NOT NULL DEFAULT 0 CHECK(actual_units>=0),
 PRIMARY KEY(turn_id,work_key,kind)
);
ALTER TABLE specialist_turn_work ADD COLUMN IF NOT EXISTS actual_units bigint NOT NULL DEFAULT 0;
ALTER TABLE specialist_turn_work ADD COLUMN IF NOT EXISTS actual_known boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS skill_dependencies (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,skill_id uuid NOT NULL,version integer NOT NULL,
 child_id uuid NOT NULL,child_version integer NOT NULL,child_digest text NOT NULL,
 PRIMARY KEY(instance_id,binding_id,skill_id,version,child_id,child_version)
);
CREATE OR REPLACE FUNCTION invalidate_skill_parents() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status IN('suspended','retired') AND OLD.status IS DISTINCT FROM NEW.status THEN
  UPDATE skill_versions p SET status='suspended',body_cipher=NULL,summary_cipher=NULL
   FROM skill_dependencies d WHERE d.instance_id=NEW.instance_id AND d.binding_id=NEW.binding_id AND d.child_id=NEW.skill_id AND d.child_version=NEW.version AND d.child_digest=NEW.digest
   AND p.instance_id=d.instance_id AND p.binding_id=d.binding_id AND p.skill_id=d.skill_id AND p.version=d.version AND p.status NOT IN('suspended','retired');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS skill_dependency_invalidated ON skill_versions;
CREATE TRIGGER skill_dependency_invalidated AFTER UPDATE OF status ON skill_versions FOR EACH ROW EXECUTE FUNCTION invalidate_skill_parents();
