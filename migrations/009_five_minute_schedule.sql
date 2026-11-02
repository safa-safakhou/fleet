-- This migrator replays constraints; retain two-minute cohorts on subsequent runs.
ALTER TABLE cohorts DROP CONSTRAINT cohorts_interval_minutes_check;
ALTER TABLE cohorts ADD CONSTRAINT cohorts_interval_minutes_check CHECK(interval_minutes IN(2,5,10,15,30,60));
