ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS owner_guidance text NOT NULL DEFAULT 'strategy';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cohorts_owner_guidance_check') THEN
    ALTER TABLE cohorts ADD CONSTRAINT cohorts_owner_guidance_check CHECK(owner_guidance IN('strategy','account_autonomy'));
  END IF;
END $$;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS discovery_cursor jsonb;
