-- Optional prefill waves retain the existing route identity, slot/resource leases and fairness.
ALTER TABLE model_capacity_routes ADD COLUMN IF NOT EXISTS wave_window_ms integer CHECK(wave_window_ms BETWEEN 10 AND 1000);
ALTER TABLE model_capacity_leases ADD COLUMN IF NOT EXISTS admitted_at timestamptz;
