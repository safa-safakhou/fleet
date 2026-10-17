-- Existing leases remain exclusive. Only host-admitted sibling workers use the new flag.
ALTER TABLE model_capacity_leases ADD COLUMN IF NOT EXISTS sibling_worker boolean NOT NULL DEFAULT false;
ALTER TABLE model_capacity_leases DROP CONSTRAINT IF EXISTS model_capacity_leases_turn_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS one_exclusive_model_lease ON model_capacity_leases(turn_id) WHERE NOT sibling_worker;
