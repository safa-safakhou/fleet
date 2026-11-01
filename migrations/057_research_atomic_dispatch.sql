-- Immediate-dispatch ports already record dispatch before invocation. Commit
-- that same boundary with canonical SQL input; filesystem and tracking ports
-- keep their separate publication/prepared/dispatch steps.
CREATE OR REPLACE FUNCTION research_capture_dispatch(sc jsonb, prepared jsonb, started jsonb,
 artifact jsonb, consent_version text, quota bigint, at_time timestamptz,
 copies jsonb, before_event jsonb, dispatched jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE ref jsonb;
BEGIN
 IF artifact->>'storageBackend' IS DISTINCT FROM 'postgres'
 OR prepared->'event'->>'kind' IS DISTINCT FROM 'model.request'
 OR dispatched->'event'->>'kind' IS DISTINCT FROM 'model.dispatched'
 OR dispatched->'event'->'parentIds' IS DISTINCT FROM jsonb_build_array(prepared->'event'->>'id')
 THEN RAISE EXCEPTION 'EVIDENCE_SCOPE_MISMATCH'; END IF;
 ref:=research_capture_write(sc,prepared,started,artifact,consent_version,quota,at_time,copies,before_event);
 IF ref->>'id' IS DISTINCT FROM prepared->'event'->>'id' THEN RAISE EXCEPTION 'EVENT_KEY_CONFLICT'; END IF;
 PERFORM research_append_event(sc,dispatched);
 RETURN ref||jsonb_build_object('dispatched',true);
END $$;
