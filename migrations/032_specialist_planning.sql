CREATE TABLE IF NOT EXISTS specialist_planning_intents (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 specialist_id text NOT NULL,operation_id uuid NOT NULL,detail_cipher text,source_revision text NOT NULL,
 status text NOT NULL CHECK(status IN('active','superseded','admitted')),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 UNIQUE(instance_id,binding_id,specialist_id,operation_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS specialist_one_active_plan ON specialist_planning_intents(instance_id,binding_id,specialist_id) WHERE status='active';
ALTER TABLE specialist_outbox ADD COLUMN IF NOT EXISTS reply_request_id uuid;
CREATE OR REPLACE FUNCTION redact_specialist_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE specialist_states SET state_cipher=NULL,support_ids='{}',version=version+1 WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND OLD.id=ANY(support_ids);
 UPDATE specialist_outbox SET payload_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 UPDATE specialist_deliveries SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND event_id LIKE 'internal:%';
 UPDATE specialist_planning_intents SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 UPDATE specialist_conflict_revisions SET detail_cipher=NULL WHERE conflict_id IN(SELECT id FROM specialist_conflicts WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id);
 UPDATE specialist_conflicts SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 RETURN OLD;
END $$;
