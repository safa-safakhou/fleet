CREATE INDEX IF NOT EXISTS specialist_pending_inbox ON specialist_deliveries(instance_id,binding_id,recipient,status,critical);
CREATE OR REPLACE FUNCTION redact_specialist_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE specialist_states SET state_cipher=NULL,support_ids='{}',version=version+1
 WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND OLD.id=ANY(support_ids);
 -- Internal prose can paraphrase its parent without a direct citation. Conservatively
 -- redact that binding's derived internal prose rather than retaining an unsupported copy.
 UPDATE specialist_outbox SET payload_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id;
 UPDATE specialist_deliveries SET detail_cipher=NULL WHERE instance_id=OLD.instance_id AND binding_id=OLD.binding_id AND event_id LIKE 'internal:%';
 RETURN OLD;
END $$;
