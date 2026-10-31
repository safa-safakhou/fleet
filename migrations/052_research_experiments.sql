CREATE TABLE IF NOT EXISTS research_experiments(id uuid PRIMARY KEY,digest text NOT NULL,spec_cipher text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_experiment_cohorts(experiment_id uuid NOT NULL REFERENCES research_experiments(id) ON DELETE CASCADE,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,consent_version bigint NOT NULL,PRIMARY KEY(experiment_id,cohort_id));
CREATE TABLE IF NOT EXISTS research_experiment_snapshots(id uuid PRIMARY KEY,experiment_id uuid NOT NULL REFERENCES research_experiments(id) ON DELETE CASCADE,digest text NOT NULL,body_cipher text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_experiment_inputs(snapshot_id uuid NOT NULL REFERENCES research_experiment_snapshots(id) ON DELETE CASCADE,metric_id uuid NOT NULL REFERENCES research_metric_snapshots(id) ON DELETE CASCADE,artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,PRIMARY KEY(snapshot_id,metric_id));
CREATE OR REPLACE FUNCTION research_experiment_consent_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT NEW.observation_consent OR NEW.observation_consent_version<>OLD.observation_consent_version THEN
  UPDATE research_experiments SET spec_cipher=NULL WHERE id IN(SELECT experiment_id FROM research_experiment_cohorts WHERE cohort_id=NEW.id);
  UPDATE research_experiment_snapshots SET body_cipher=NULL WHERE experiment_id IN(SELECT experiment_id FROM research_experiment_cohorts WHERE cohort_id=NEW.id);
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_experiment_consent_changed ON cohorts;
CREATE TRIGGER research_experiment_consent_changed AFTER UPDATE OF observation_consent,observation_consent_version ON cohorts FOR EACH ROW EXECUTE FUNCTION research_experiment_consent_changed();
CREATE OR REPLACE FUNCTION research_experiment_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE research_experiment_snapshots SET body_cipher=NULL WHERE id IN(SELECT snapshot_id FROM research_experiment_inputs WHERE artifact_id=OLD.id);RETURN OLD;
 END IF;
 IF NEW.status<>'complete' OR NEW.purged THEN
  UPDATE research_experiment_snapshots SET body_cipher=NULL WHERE id IN(SELECT snapshot_id FROM research_experiment_inputs WHERE artifact_id=NEW.id);
 ELSIF NEW.expires_at<OLD.expires_at THEN
  UPDATE research_experiment_snapshots SET expires_at=LEAST(expires_at,NEW.expires_at) WHERE id IN(SELECT snapshot_id FROM research_experiment_inputs WHERE artifact_id=NEW.id);
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_experiment_source_changed ON research_artifacts;
CREATE TRIGGER research_experiment_source_changed AFTER UPDATE OF status,purged,expires_at ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_experiment_source_changed();
DROP TRIGGER IF EXISTS research_experiment_source_deleted ON research_artifacts;
CREATE TRIGGER research_experiment_source_deleted BEFORE DELETE ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_experiment_source_changed();
