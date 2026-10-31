-- Native-only compute journal: no prompts/vectors in plaintext, no generative allocations.
CREATE TABLE IF NOT EXISTS research_embedding_jobs (
 operation_id text NOT NULL REFERENCES research_operations(operation_id) ON DELETE CASCADE,logical_key text NOT NULL,
 namespace text NOT NULL,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,policy_id text NOT NULL,
 original_epoch text NOT NULL,input_digest text,result_cipher text,memory_id uuid,source_version bigint,
 status text NOT NULL CHECK(status IN('unknown','completed','expired')),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 cpu_ms double precision,duration_ms double precision,purpose text NOT NULL DEFAULT 'embedding' CHECK(purpose='embedding'),
 PRIMARY KEY(operation_id,logical_key)
);
REVOKE ALL ON research_embedding_jobs FROM PUBLIC,fleet_research_index;
CREATE OR REPLACE FUNCTION research_embedding_memory_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE research_embedding_jobs SET status='expired',input_digest=NULL,result_cipher=NULL,memory_id=NULL,source_version=NULL
 WHERE memory_id=OLD.id; IF TG_OP='UPDATE' THEN RETURN NEW; END IF; RETURN OLD;END $$;
DROP TRIGGER IF EXISTS research_embedding_memory_changed ON research_memories;
CREATE TRIGGER research_embedding_memory_changed BEFORE DELETE OR UPDATE OF version ON research_memories FOR EACH ROW EXECUTE FUNCTION research_embedding_memory_changed();
CREATE OR REPLACE FUNCTION research_embedding_grant_deleted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE research_embedding_jobs SET status='expired',input_digest=NULL,result_cipher=NULL,memory_id=NULL,source_version=NULL
 WHERE namespace=OLD.namespace AND policy_id=OLD.id; RETURN OLD;END $$;
DROP TRIGGER IF EXISTS research_embedding_grant_deleted ON research_index_grants;
CREATE TRIGGER research_embedding_grant_deleted BEFORE DELETE ON research_index_grants FOR EACH ROW EXECUTE FUNCTION research_embedding_grant_deleted();

CREATE TABLE IF NOT EXISTS research_embedding_job_artifacts (
 operation_id text NOT NULL,logical_key text NOT NULL,artifact_id uuid NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
 PRIMARY KEY(operation_id,logical_key,artifact_id),FOREIGN KEY(operation_id,logical_key) REFERENCES research_embedding_jobs(operation_id,logical_key) ON DELETE CASCADE
);
REVOKE ALL ON research_embedding_job_artifacts FROM PUBLIC,fleet_research_index;
CREATE OR REPLACE FUNCTION research_embedding_job_expired() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='expired' THEN
  UPDATE research_artifacts SET status='expired',inline_cipher=NULL,expires_at=LEAST(expires_at,NEW.expires_at)
  WHERE id IN(SELECT artifact_id FROM research_embedding_job_artifacts WHERE operation_id=NEW.operation_id AND logical_key=NEW.logical_key);
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_embedding_job_expired ON research_embedding_jobs;
CREATE TRIGGER research_embedding_job_expired AFTER UPDATE OF status ON research_embedding_jobs FOR EACH ROW EXECUTE FUNCTION research_embedding_job_expired();
