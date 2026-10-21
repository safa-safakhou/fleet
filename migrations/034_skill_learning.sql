CREATE TABLE IF NOT EXISTS skill_learning_operations (
 operation_id uuid PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,
 specialist_id text NOT NULL,input_digest text NOT NULL,refs jsonb NOT NULL,allocation_ids uuid[] NOT NULL,created_at timestamptz NOT NULL
);
