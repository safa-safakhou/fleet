ALTER TABLE turns ADD COLUMN IF NOT EXISTS worker_waiting boolean NOT NULL DEFAULT false;
ALTER TABLE model_capacity_leases ADD COLUMN IF NOT EXISTS bypasses integer NOT NULL DEFAULT 0 CHECK (bypasses BETWEEN 0 AND 4);
