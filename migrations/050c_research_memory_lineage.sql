-- Private copies retain their source's deadline; revocation propagates through the evidence DAG.
CREATE TABLE IF NOT EXISTS research_artifact_sources (
 artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
 source_artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
 PRIMARY KEY(artifact_id,source_artifact_id),CHECK(artifact_id<>source_artifact_id)
);
CREATE INDEX IF NOT EXISTS research_artifact_source_lookup ON research_artifact_sources(source_artifact_id);
REVOKE ALL ON research_artifact_sources FROM PUBLIC,fleet_research_index;
CREATE OR REPLACE FUNCTION research_derived_artifact_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE research_artifacts SET status='expired',inline_cipher=NULL
   WHERE id IN(SELECT artifact_id FROM research_artifact_sources WHERE source_artifact_id=OLD.id);
  RETURN OLD;
 END IF;
 IF NEW.status IS DISTINCT FROM OLD.status OR NEW.purged IS DISTINCT FROM OLD.purged OR NEW.expires_at<OLD.expires_at THEN
  UPDATE research_artifacts SET expires_at=LEAST(expires_at,NEW.expires_at),
   status=CASE WHEN NEW.status<>'complete' OR NEW.purged THEN 'expired' ELSE status END,
   inline_cipher=CASE WHEN NEW.status<>'complete' OR NEW.purged THEN NULL ELSE inline_cipher END
   WHERE id IN(SELECT artifact_id FROM research_artifact_sources WHERE source_artifact_id=NEW.id);
 END IF;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_derived_artifact_changed ON research_artifacts;
CREATE TRIGGER research_derived_artifact_changed AFTER UPDATE OF status,purged,expires_at ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_derived_artifact_changed();
DROP TRIGGER IF EXISTS research_derived_artifact_deleted ON research_artifacts;
CREATE TRIGGER research_derived_artifact_deleted BEFORE DELETE ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_derived_artifact_changed();
