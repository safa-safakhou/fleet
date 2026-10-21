CREATE TABLE IF NOT EXISTS specialist_claims (
 id uuid PRIMARY KEY,command_id uuid NOT NULL UNIQUE,instance_id text NOT NULL,
 binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,
 intent_digest text NOT NULL,claims_cipher text,valid_until jsonb NOT NULL,
 status text NOT NULL DEFAULT 'held' CHECK(status IN('held','released')),created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS specialist_claims_held ON specialist_claims(binding_id,status);
CREATE TABLE IF NOT EXISTS specialist_intents (
 command_id uuid PRIMARY KEY REFERENCES platform_commands(command_id) ON DELETE CASCADE,
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,
 turn_id uuid NOT NULL REFERENCES turns(id) ON DELETE CASCADE,task_id uuid NOT NULL REFERENCES platform_tasks(id) ON DELETE CASCADE,
 input_digest text NOT NULL,effects_cipher text,state_version integer NOT NULL,
 status text NOT NULL DEFAULT 'accepted' CHECK(status IN('accepted','uncertain','settled')),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,UNIQUE(turn_id,specialist_id)
);
CREATE TABLE IF NOT EXISTS specialist_action_results (
 command_id uuid PRIMARY KEY REFERENCES platform_commands(command_id) ON DELETE CASCADE,
 instance_id text NOT NULL,binding_id uuid NOT NULL REFERENCES environment_bindings(id) ON DELETE CASCADE,specialist_id text NOT NULL,
 result_version integer NOT NULL CHECK(result_version=1),outcome jsonb NOT NULL,created_at timestamptz NOT NULL
);
