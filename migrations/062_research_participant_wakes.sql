-- Future native participant deliveries get their own durable Temporal wake.
-- Do not fabricate platform sources or backfill/replay historical deliveries.
CREATE OR REPLACE FUNCTION research_specialist_wake_key(delivery uuid) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT encode(sha256(convert_to('specialist:'||delivery::text,'UTF8')),'hex')
$$;
CREATE OR REPLACE FUNCTION research_wake_specialist_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO research_task_outbox(task_id,kind,dedupe_key,created_at)
 SELECT NEW.task_id,'wake',research_specialist_wake_key(NEW.id),NEW.received_at
 FROM research_task_owners WHERE task_id=NEW.task_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS research_wake_specialist_delivery ON specialist_deliveries;
CREATE TRIGGER research_wake_specialist_delivery AFTER INSERT ON specialist_deliveries
FOR EACH ROW EXECUTE FUNCTION research_wake_specialist_delivery();
