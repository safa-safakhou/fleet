ALTER TABLE platform_tasks ADD COLUMN IF NOT EXISTS participant_id text;
ALTER TABLE platform_tasks ADD COLUMN IF NOT EXISTS architecture_instance_id text;
CREATE TABLE IF NOT EXISTS specialist_event_roots (
 binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,event_id text NOT NULL,root_id uuid NOT NULL,
 PRIMARY KEY(binding_id,event_id)
);
CREATE TABLE IF NOT EXISTS specialist_deliveries (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 event_id text NOT NULL,recipient text NOT NULL,subscription_version text NOT NULL,
 task_id uuid NOT NULL REFERENCES platform_tasks(id) ON DELETE CASCADE,source_ref text NOT NULL,observed_at timestamptz NOT NULL,
 environment_time jsonb NOT NULL,root_id uuid NOT NULL,parent_id uuid,depth integer NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 4),
 critical boolean NOT NULL DEFAULT false,detail_cipher text,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','acknowledged')),
 received_at timestamptz NOT NULL,sequence bigserial NOT NULL,
 UNIQUE(instance_id,binding_id,event_id,recipient,subscription_version)
);
CREATE INDEX IF NOT EXISTS specialist_delivery_task ON specialist_deliveries(task_id,sequence);
CREATE TABLE IF NOT EXISTS specialist_outbox (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 sender text NOT NULL,recipient text NOT NULL,operation_id uuid NOT NULL,message_index integer NOT NULL CHECK(message_index BETWEEN 0 AND 7),
 root_id uuid NOT NULL,parent_id uuid NOT NULL,depth integer NOT NULL CHECK(depth BETWEEN 1 AND 4),conflict_round integer NOT NULL CHECK(conflict_round BETWEEN 0 AND 2),
 payload_cipher text,payload_digest text NOT NULL,evidence_ids uuid[] NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','delivered','blocked')),delivery_id uuid,
 created_at timestamptz NOT NULL,UNIQUE(instance_id,binding_id,sender,operation_id,message_index)
);
CREATE TABLE IF NOT EXISTS specialist_wakes (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 specialist_id text NOT NULL,condition_cipher text,root_id uuid NOT NULL,status text NOT NULL DEFAULT 'waiting' CHECK(status IN('waiting','ready','unknown','blocked','resolved')),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
