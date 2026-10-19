-- Additive identity associations. Legacy IDs, ciphertext and terminal uniqueness remain untouched.
CREATE TABLE IF NOT EXISTS environment_bindings (
 id uuid PRIMARY KEY, agent_id uuid NOT NULL REFERENCES agents(id),
 environment_id text NOT NULL CHECK(length(environment_id) BETWEEN 1 AND 100),
 environment_version text NOT NULL CHECK(length(environment_version) BETWEEN 1 AND 100),
 instance_id text NOT NULL CHECK(length(instance_id) BETWEEN 1 AND 2000),
 account_ref text NOT NULL CHECK(length(account_ref) BETWEEN 1 AND 2000),
 actor_ref text NOT NULL CHECK(length(actor_ref) BETWEEN 1 AND 2000),
 entity_ref text NOT NULL CHECK(length(entity_ref) BETWEEN 1 AND 2000),
 state text NOT NULL DEFAULT 'active' CHECK(state IN('active','retired')),
 provenance text NOT NULL CHECK(provenance IN('recorded','inferred_legacy')),
 created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_controlling_binding ON environment_bindings(environment_id,instance_id,entity_ref) WHERE state='active';
CREATE UNIQUE INDEX IF NOT EXISTS one_agent_binding ON environment_bindings(agent_id) WHERE state='active';
