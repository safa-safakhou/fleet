-- Qualification is append-only evidence, never an execution or index grant.
CREATE TABLE IF NOT EXISTS research_qualifications (
 id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
 manifest_digest text NOT NULL REFERENCES research_manifests(digest),
 scope text NOT NULL CHECK (scope IN ('fixture','installation','provider','behavior')),
 status text NOT NULL CHECK (status IN ('qualified','blocked')),
 decision jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_qualifications_manifest_scope ON research_qualifications(manifest_digest,scope,created_at DESC);
DROP TRIGGER IF EXISTS research_qualification_immutable ON research_qualifications;
CREATE TRIGGER research_qualification_immutable BEFORE UPDATE OR DELETE ON research_qualifications FOR EACH ROW EXECUTE FUNCTION research_manifest_immutable();
