CREATE TABLE IF NOT EXISTS research_runs (
 run_id text PRIMARY KEY, agent_id uuid NOT NULL REFERENCES agents(id),cohort_id uuid NOT NULL REFERENCES cohorts(id),
 binding_id text NOT NULL,manifest_digest text NOT NULL,provenance text NOT NULL CHECK(provenance IN ('research','compatibility')),
 next_ordinal bigint NOT NULL DEFAULT 0,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 capture_failed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS research_evidence_scopes (
 run_id text NOT NULL REFERENCES research_runs(run_id),operation_id text NOT NULL,epoch text NOT NULL,
 turn_id uuid NOT NULL REFERENCES turns(id),scope jsonb NOT NULL,
 PRIMARY KEY(run_id,operation_id,epoch)
);
CREATE TABLE IF NOT EXISTS research_evidence_streams (
 run_id text NOT NULL REFERENCES research_runs(run_id),stream_id text NOT NULL,last_sequence bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(run_id,stream_id)
);
CREATE TABLE IF NOT EXISTS research_events (
 id uuid PRIMARY KEY,run_id text NOT NULL REFERENCES research_runs(run_id),stream_id text NOT NULL,sequence bigint NOT NULL,
 ordinal bigint NOT NULL,producer_key text NOT NULL,input_digest text NOT NULL,event jsonb NOT NULL,
 UNIQUE(run_id,stream_id,producer_key),UNIQUE(run_id,ordinal),UNIQUE(run_id,stream_id,sequence)
);
CREATE INDEX IF NOT EXISTS research_events_page ON research_events(run_id,ordinal);
CREATE INDEX IF NOT EXISTS research_scopes_turn ON research_evidence_scopes(turn_id);
CREATE OR REPLACE FUNCTION research_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'EVENT_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS research_event_immutable ON research_events;
CREATE TRIGGER research_event_immutable BEFORE UPDATE OR DELETE ON research_events
FOR EACH ROW EXECUTE FUNCTION research_event_immutable();
