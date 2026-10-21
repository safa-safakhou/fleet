CREATE TABLE IF NOT EXISTS specialist_original_index (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 origin_key text NOT NULL,evidence_id uuid NOT NULL REFERENCES architecture_scoped_evidence(id) ON DELETE CASCADE,
 PRIMARY KEY(instance_id,binding_id,origin_key)
);
