CREATE TABLE IF NOT EXISTS specialist_conflicts (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 concern_key text NOT NULL,revision text NOT NULL,root_id uuid NOT NULL,round integer NOT NULL CHECK(round BETWEEN 0 AND 2),
 proposal_digest text NOT NULL,status text NOT NULL CHECK(status IN('open','blocked','resolved')),detail_cipher text,
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(instance_id,binding_id,concern_key,revision)
);
CREATE TABLE IF NOT EXISTS specialist_conflict_revisions (
 conflict_id uuid NOT NULL REFERENCES specialist_conflicts(id) ON DELETE CASCADE,round integer NOT NULL CHECK(round BETWEEN 0 AND 2),
 proposal_digest text NOT NULL,detail_cipher text,created_at timestamptz NOT NULL,PRIMARY KEY(conflict_id,round)
);
CREATE SEQUENCE IF NOT EXISTS specialist_admission_ticket;
CREATE TABLE IF NOT EXISTS specialist_participant_admission (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,
 last_ticket bigint NOT NULL,PRIMARY KEY(instance_id,binding_id,specialist_id)
);
