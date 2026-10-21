CREATE TABLE IF NOT EXISTS specialist_work_cursors (
 binding_id uuid PRIMARY KEY REFERENCES environment_bindings(id) ON DELETE CASCADE,next_due_at timestamptz NOT NULL,last_code text NOT NULL
);
