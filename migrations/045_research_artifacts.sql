ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS observation_consent_version bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION research_consent_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.observation_consent IS DISTINCT FROM OLD.observation_consent THEN NEW.observation_consent_version=OLD.observation_consent_version+1; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS research_consent_version ON cohorts;
CREATE TRIGGER research_consent_version BEFORE UPDATE OF observation_consent ON cohorts FOR EACH ROW EXECUTE FUNCTION research_consent_version();
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS artifact_reserved_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE research_runs ADD COLUMN IF NOT EXISTS artifact_quota_bytes bigint;
CREATE TABLE IF NOT EXISTS research_artifacts (
 id uuid PRIMARY KEY,run_id text NOT NULL REFERENCES research_runs(run_id),scope jsonb NOT NULL,
 consent_version bigint NOT NULL,content_type text NOT NULL,privacy_class text NOT NULL,retention_class text NOT NULL,
 status text NOT NULL CHECK(status IN ('writing','complete','partial','expired','withheld')),
 expected_bytes bigint, reserved_bytes bigint NOT NULL,bytes bigint NOT NULL DEFAULT 0,disk_bytes bigint NOT NULL DEFAULT 0,
 chunks jsonb NOT NULL DEFAULT '[]',inline_cipher jsonb,ciphertext_digest text,reason text,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,purged boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS research_artifact_run ON research_artifacts(run_id);
CREATE INDEX IF NOT EXISTS research_artifact_expiry ON research_artifacts(expires_at) WHERE NOT purged;
