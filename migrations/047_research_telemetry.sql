CREATE TABLE IF NOT EXISTS research_telemetry_delivery (
 event_id uuid PRIMARY KEY REFERENCES research_events(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','exported','dropped')),
 attempts integer NOT NULL DEFAULT 0,
 owner uuid,
 lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT '-infinity',
 updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS research_telemetry_pending ON research_telemetry_delivery(state,next_attempt_at);
