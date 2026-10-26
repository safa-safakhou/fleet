-- Optional weighted admission. NULL on old leases means unknown demand, never zero.
ALTER TABLE model_capacity_routes ADD COLUMN IF NOT EXISTS token_capacity bigint CHECK(token_capacity BETWEEN 1 AND 4194304);
ALTER TABLE model_capacity_leases ADD COLUMN IF NOT EXISTS token_units bigint CHECK(token_units BETWEEN 1 AND 4194304);
