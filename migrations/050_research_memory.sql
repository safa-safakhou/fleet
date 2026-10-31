DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='fleet_research_index') THEN CREATE ROLE fleet_research_index NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$;
GRANT fleet_research_index TO CURRENT_USER;
CREATE TABLE IF NOT EXISTS research_memory_sources (
 artifact_id uuid PRIMARY KEY REFERENCES research_artifacts(id) ON DELETE CASCADE,namespace text NOT NULL,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
 source_class text NOT NULL,observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consent_version bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS research_memories (
 id uuid PRIMARY KEY,namespace text NOT NULL,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,kind text NOT NULL,source_class text NOT NULL,
 version bigint NOT NULL CHECK(version>0),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS research_memory_namespace ON research_memories(namespace,created_at,id);
CREATE TABLE IF NOT EXISTS research_memory_versions (
 memory_id uuid NOT NULL REFERENCES research_memories(id) ON DELETE CASCADE,version bigint NOT NULL,value_cipher text NOT NULL,
 PRIMARY KEY(memory_id,version)
);
CREATE TABLE IF NOT EXISTS research_memory_links (
 memory_id uuid NOT NULL,version bigint NOT NULL,artifact_id uuid NOT NULL REFERENCES research_memory_sources(artifact_id) ON DELETE CASCADE,
 PRIMARY KEY(memory_id,version,artifact_id),FOREIGN KEY(memory_id,version) REFERENCES research_memory_versions(memory_id,version) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS research_index_grants (
 id text NOT NULL,namespace text NOT NULL,cohort_id uuid NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,consent_version bigint NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(id,namespace)
);
CREATE TABLE IF NOT EXISTS research_memory_projections (
 memory_id uuid PRIMARY KEY REFERENCES research_memories(id) ON DELETE CASCADE,version bigint NOT NULL,namespace text NOT NULL,policy_id text NOT NULL,
 approved_text text NOT NULL,language regconfig NOT NULL,lexemes tsvector NOT NULL,embedding_revision text,embedding_digest text,dimension integer,normalization text,
 FOREIGN KEY(policy_id,namespace) REFERENCES research_index_grants(id,namespace) ON DELETE CASCADE,
 CHECK((embedding_revision IS NULL AND embedding_digest IS NULL AND dimension IS NULL AND normalization IS NULL) OR (embedding_revision IS NOT NULL AND embedding_digest~'^[a-f0-9]{64}$' AND dimension BETWEEN 1 AND 4096 AND normalization IN('l2','none')))
);
CREATE INDEX IF NOT EXISTS research_memory_fts ON research_memory_projections USING gin(lexemes);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector') THEN
  CREATE EXTENSION IF NOT EXISTS vector VERSION '0.8.7';
  ALTER TABLE research_memory_projections ADD COLUMN IF NOT EXISTS embedding vector;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='research_vector_dimension') THEN
   ALTER TABLE research_memory_projections ADD CONSTRAINT research_vector_dimension CHECK(embedding IS NULL OR vector_dims(embedding)=dimension);
  END IF;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS research_index_tickets(token text PRIMARY KEY,transaction_id text NOT NULL,namespace text NOT NULL,policy_id text NOT NULL,at_time timestamptz NOT NULL);
REVOKE ALL ON research_index_tickets FROM PUBLIC,fleet_research_index;
CREATE OR REPLACE FUNCTION research_projection_visible(ns text,policy text,mid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM public.research_index_tickets t JOIN public.research_index_grants g ON g.namespace=t.namespace AND g.id=t.policy_id JOIN public.cohorts c ON c.id=g.cohort_id JOIN public.research_memories m ON m.id=mid AND m.namespace=g.namespace
 WHERE t.token=current_setting('fleet.research.ticket',true) AND t.transaction_id=pg_current_xact_id()::text AND t.namespace=ns AND t.policy_id=policy AND c.observation_consent AND c.observation_consent_version=g.consent_version AND m.expires_at>t.at_time
 AND NOT EXISTS(SELECT 1 FROM public.research_memory_links l JOIN public.research_memory_sources s ON s.artifact_id=l.artifact_id JOIN public.research_artifacts a ON a.id=s.artifact_id WHERE l.memory_id=m.id AND l.version=m.version AND (s.expires_at<=t.at_time OR a.status<>'complete' OR a.purged OR a.expires_at<=t.at_time OR s.consent_version<>c.observation_consent_version)))
$$;
REVOKE ALL ON FUNCTION research_projection_visible(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research_projection_visible(text,text,uuid) TO fleet_research_index;
ALTER TABLE research_memory_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_memory_projections FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_projection_scope ON research_memory_projections;
CREATE POLICY research_projection_scope ON research_memory_projections FOR SELECT TO fleet_research_index USING(research_projection_visible(namespace,policy_id,memory_id));
GRANT SELECT ON research_memory_projections TO fleet_research_index;
CREATE OR REPLACE FUNCTION research_memory_artifact_expired() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status<>'complete' OR NEW.purged THEN
  DELETE FROM research_memories WHERE id IN(SELECT memory_id FROM research_memory_links WHERE artifact_id=NEW.id);
  DELETE FROM research_memory_sources WHERE artifact_id=NEW.id;
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_memory_artifact_expired ON research_artifacts;
CREATE TRIGGER research_memory_artifact_expired AFTER UPDATE OF status,purged ON research_artifacts FOR EACH ROW EXECUTE FUNCTION research_memory_artifact_expired();
CREATE OR REPLACE FUNCTION research_memory_consent_changed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT NEW.observation_consent OR NEW.observation_consent_version<>OLD.observation_consent_version THEN
  DELETE FROM research_index_grants WHERE cohort_id=NEW.id;
  DELETE FROM research_memories WHERE cohort_id=NEW.id;
  DELETE FROM research_memory_sources WHERE cohort_id=NEW.id;
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS research_memory_consent_changed ON cohorts;
CREATE TRIGGER research_memory_consent_changed AFTER UPDATE OF observation_consent,observation_consent_version ON cohorts FOR EACH ROW EXECUTE FUNCTION research_memory_consent_changed();

CREATE OR REPLACE FUNCTION research_memory_source_deleted() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 DELETE FROM research_memories WHERE id IN(SELECT memory_id FROM research_memory_links WHERE artifact_id=OLD.artifact_id);RETURN OLD;END $$;
DROP TRIGGER IF EXISTS research_memory_source_deleted ON research_memory_sources;
CREATE TRIGGER research_memory_source_deleted BEFORE DELETE ON research_memory_sources FOR EACH ROW EXECUTE FUNCTION research_memory_source_deleted();
