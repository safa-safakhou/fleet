ALTER TABLE platform_tasks ADD COLUMN IF NOT EXISTS scheduler_owner text NOT NULL DEFAULT 'platform' CHECK(scheduler_owner IN ('platform','temporal'));
ALTER TABLE platform_tasks ADD COLUMN IF NOT EXISTS research_manifest_digest text REFERENCES research_manifests(digest);
CREATE TABLE IF NOT EXISTS research_task_owners (
 task_id uuid PRIMARY KEY REFERENCES platform_tasks(id),manifest_digest text NOT NULL REFERENCES research_manifests(digest),
 phase text NOT NULL CHECK(phase IN ('ready','executing','waiting','awaiting_reconciliation','completed','cancelled')),
 stop_id uuid,stop_requested_at timestamptz,fenced_at timestamptz,acknowledged_at timestamptz,created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS research_task_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),task_id uuid NOT NULL REFERENCES research_task_owners(task_id),
 kind text NOT NULL CHECK(kind IN ('wake','stop','reconcile')),dedupe_key text NOT NULL,
 delivered_at timestamptz,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL,
 UNIQUE(task_id,dedupe_key)
);
CREATE TABLE IF NOT EXISTS research_task_executions (
 delivery_id uuid PRIMARY KEY REFERENCES research_task_outbox(id),task_id uuid NOT NULL REFERENCES research_task_owners(task_id),
 turn_id uuid UNIQUE REFERENCES turns(id),phase text NOT NULL CHECK(phase IN ('prepared','executing','awaiting_reconciliation','settled')),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS research_one_unsettled_task ON research_task_executions(task_id) WHERE phase<>'settled';
CREATE OR REPLACE FUNCTION research_wake_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO research_task_outbox(task_id,kind,dedupe_key,created_at)
 SELECT NEW.task_id,'wake',encode(sha256(convert_to(NEW.binding_id::text||':'||NEW.event_id,'UTF8')),'hex'),NEW.observed_at
 FROM research_task_owners WHERE task_id=NEW.task_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS research_wake_source ON platform_task_sources;
CREATE TRIGGER research_wake_source AFTER INSERT ON platform_task_sources FOR EACH ROW EXECUTE FUNCTION research_wake_source();
CREATE TABLE IF NOT EXISTS research_task_routes (
 binding_id uuid NOT NULL REFERENCES environment_bindings(id),task_key text NOT NULL,profile_id text NOT NULL,profile_version text NOT NULL,
 manifest_digest text NOT NULL REFERENCES research_manifests(digest),PRIMARY KEY(binding_id,task_key)
);
CREATE OR REPLACE FUNCTION research_inherit_task_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE route research_task_routes%ROWTYPE;
BEGIN
 SELECT * INTO route FROM research_task_routes WHERE binding_id=NEW.binding_id AND task_key=NEW.task_key;
 IF FOUND THEN
  IF route.profile_id<>NEW.profile_id OR route.profile_version<>NEW.profile_version THEN RAISE EXCEPTION 'RESEARCH_ROUTE_PROFILE_MISMATCH'; END IF;
  UPDATE platform_tasks SET scheduler_owner='temporal',research_manifest_digest=route.manifest_digest WHERE id=NEW.id;
  INSERT INTO research_task_owners(task_id,manifest_digest,phase,created_at) VALUES(NEW.id,route.manifest_digest,'ready',NEW.created_at);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS research_inherit_task_owner ON platform_tasks;
CREATE TRIGGER research_inherit_task_owner AFTER INSERT ON platform_tasks FOR EACH ROW EXECUTE FUNCTION research_inherit_task_owner();
