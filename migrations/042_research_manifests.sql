CREATE TABLE IF NOT EXISTS research_manifests (
 digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL CHECK(manifest->>'status'='experimental'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION research_manifest_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'MANIFEST_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS research_manifest_immutable ON research_manifests;
CREATE TRIGGER research_manifest_immutable BEFORE UPDATE OR DELETE ON research_manifests
FOR EACH ROW EXECUTE FUNCTION research_manifest_immutable();
