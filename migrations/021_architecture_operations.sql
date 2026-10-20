CREATE TABLE IF NOT EXISTS architecture_operations (
 turn_id uuid PRIMARY KEY REFERENCES turns(id) ON DELETE CASCADE,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id),
 profile_id text NOT NULL,profile_version text NOT NULL,mode text NOT NULL CHECK(mode IN('serial','sibling-reasoning')),mode_version integer NOT NULL CHECK(mode_version=1),created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS architecture_allocations (
 allocation_id uuid PRIMARY KEY REFERENCES compute_ledger(id) ON DELETE CASCADE,turn_id uuid NOT NULL REFERENCES architecture_operations(turn_id) ON DELETE CASCADE,
 tracked boolean NOT NULL DEFAULT false,dispatch_state text NOT NULL DEFAULT 'prepared' CHECK(dispatch_state IN('prepared','invoking_untracked','dispatched','settled','unknown','not_dispatched')),updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS architecture_scoped_state (
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,codec text NOT NULL,version integer NOT NULL,
 value_cipher text NOT NULL,updated_at timestamptz NOT NULL,PRIMARY KEY(instance_id,binding_id,codec)
);
CREATE TABLE IF NOT EXISTS architecture_scoped_evidence (
 id uuid PRIMARY KEY,instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,kind text NOT NULL,detail_cipher text NOT NULL,created_at timestamptz NOT NULL
);
