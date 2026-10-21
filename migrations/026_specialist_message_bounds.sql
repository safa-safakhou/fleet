ALTER TABLE specialist_wakes ADD COLUMN IF NOT EXISTS condition_digest text;
ALTER TABLE specialist_wakes ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS specialist_wake_once ON specialist_wakes(instance_id,binding_id,specialist_id,root_id,condition_digest);
CREATE INDEX IF NOT EXISTS specialist_outbox_pending ON specialist_outbox(status,created_at);
CREATE INDEX IF NOT EXISTS specialist_wakes_pending ON specialist_wakes(status,updated_at);
ALTER TABLE specialist_deliveries DROP CONSTRAINT IF EXISTS specialist_deliveries_status_check;
ALTER TABLE specialist_deliveries ADD CONSTRAINT specialist_deliveries_status_check CHECK(status IN('pending','acknowledged','superseded'));
