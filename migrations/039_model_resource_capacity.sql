-- Named transient capacity is separate from billed/unknown token accounting.
ALTER TABLE model_capacity_routes ADD COLUMN IF NOT EXISTS resource_unit text CHECK(resource_unit ~ '^[a-zA-Z0-9._-]{1,80}$');
ALTER TABLE model_capacity_routes ADD COLUMN IF NOT EXISTS resource_capacity bigint CHECK(resource_capacity BETWEEN 1 AND 4194304);
ALTER TABLE model_capacity_routes ADD COLUMN IF NOT EXISTS resource_fingerprint text CHECK(resource_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE model_capacity_leases ADD COLUMN IF NOT EXISTS resource_units bigint CHECK(resource_units BETWEEN 1 AND 4194304);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='model_capacity_routes'::regclass AND conname='model_resource_policy_complete') THEN
    ALTER TABLE model_capacity_routes ADD CONSTRAINT model_resource_policy_complete CHECK(
      (resource_unit IS NULL AND resource_capacity IS NULL AND resource_fingerprint IS NULL) OR
      (resource_unit IS NOT NULL AND resource_capacity IS NOT NULL AND resource_fingerprint IS NOT NULL));
  END IF;
END $$;
