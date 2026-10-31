CREATE TABLE IF NOT EXISTS research_candidates(id uuid PRIMARY KEY,digest text NOT NULL UNIQUE,body_cipher text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_candidate_sources(candidate_id uuid NOT NULL REFERENCES research_candidates(id) ON DELETE CASCADE,artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,PRIMARY KEY(candidate_id,artifact_id));
CREATE TABLE IF NOT EXISTS research_holdout_claims(dataset_digest text PRIMARY KEY,candidate_id uuid NOT NULL REFERENCES research_candidates(id),created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_candidate_assessments(id uuid PRIMARY KEY,candidate_id uuid NOT NULL REFERENCES research_candidates(id),digest text NOT NULL,body_cipher text,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS research_mlflow_sync(snapshot_id uuid PRIMARY KEY REFERENCES research_experiment_snapshots(id) ON DELETE CASCADE,digest text NOT NULL,status text NOT NULL CHECK(status IN('synced','unavailable')),updated_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION research_candidate_source_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE research_candidates SET body_cipher=NULL WHERE id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=OLD.id);
  UPDATE research_candidate_assessments SET body_cipher=NULL WHERE candidate_id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=OLD.id);RETURN OLD;
 END IF;
 IF NEW.status<>'complete' OR NEW.purged THEN
  UPDATE research_candidates SET body_cipher=NULL WHERE id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=NEW.id);
  UPDATE research_candidate_assessments SET body_cipher=NULL WHERE candidate_id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=NEW.id);
 ELSIF NEW.expires_at<OLD.expires_at THEN
  UPDATE research_candidates SET expires_at=LEAST(expires_at,NEW.expires_at) WHERE id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=NEW.id);
  UPDATE research_candidate_assessments SET expires_at=LEAST(expires_at,NEW.expires_at) WHERE candidate_id IN(SELECT candidate_id FROM research_candidate_sources WHERE artifact_id=NEW.id);
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_candidate_source_changed ON research_artifacts;
CREATE TRIGGER research_candidate_source_changed AFTER UPDATE OF status,purged,expires_at ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_candidate_source_changed();
DROP TRIGGER IF EXISTS research_candidate_source_deleted ON research_artifacts;
CREATE TRIGGER research_candidate_source_deleted BEFORE DELETE ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_candidate_source_changed();
CREATE OR REPLACE FUNCTION research_candidate_consent_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT NEW.observation_consent OR NEW.observation_consent_version<>OLD.observation_consent_version THEN
  UPDATE research_candidates SET body_cipher=NULL WHERE id IN(SELECT s.candidate_id FROM research_candidate_sources s JOIN research_artifacts a ON a.id=s.artifact_id JOIN research_runs r ON r.run_id=a.run_id WHERE r.cohort_id=NEW.id);
  UPDATE research_candidate_assessments SET body_cipher=NULL WHERE candidate_id IN(SELECT s.candidate_id FROM research_candidate_sources s JOIN research_artifacts a ON a.id=s.artifact_id JOIN research_runs r ON r.run_id=a.run_id WHERE r.cohort_id=NEW.id);
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_candidate_consent_changed ON cohorts;
CREATE TRIGGER research_candidate_consent_changed AFTER UPDATE OF observation_consent,observation_consent_version ON cohorts FOR EACH ROW EXECUTE FUNCTION research_candidate_consent_changed();
REVOKE ALL ON research_candidates,research_candidate_sources,research_holdout_claims,research_candidate_assessments,research_mlflow_sync FROM PUBLIC,fleet_research_index;
