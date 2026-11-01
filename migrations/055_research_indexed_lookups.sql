-- Scalar primary-key lookups keep validation independent of retained history.
-- No authority check, digest check or lock is removed. Invoker rights throughout.
CREATE OR REPLACE FUNCTION research_parent_run(parent_id uuid) RETURNS text
LANGUAGE sql STABLE STRICT AS $$
 SELECT run_id FROM research_events WHERE id=parent_id
$$;

CREATE OR REPLACE FUNCTION research_acknowledge_copy(artifact_id uuid, expected_digest text) RETURNS void
LANGUAGE sql AS $$
 WITH ready AS MATERIALIZED (
 SELECT id FROM research_artifacts WHERE id=artifact_id AND ciphertext_digest=expected_digest
 AND inline_cipher IS NOT NULL AND status='complete' FOR UPDATE SKIP LOCKED
 ) UPDATE research_artifacts a SET inline_cipher=NULL FROM ready WHERE a.id=ready.id
$$;

-- Set-returning JSON functions estimate100 rows even for one identifier. A join
-- can therefore scan every retained row. Scalar lookups retain bounded work.
CREATE OR REPLACE FUNCTION research_acknowledge_copies(copies jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE copy record;
BEGIN
 FOR copy IN SELECT * FROM jsonb_to_recordset(copies) p(id uuid,digest text) LOOP
  PERFORM research_acknowledge_copy(copy.id,copy.digest);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION research_append_event(sc jsonb, prepared jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE e jsonb:=prepared->'event'; old record; seq bigint; ord bigint; parent_id uuid;
BEGIN
 IF NOT research_bind_existing_scope(sc) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 SELECT id,input_digest,event INTO old FROM research_events WHERE run_id=sc->>'runId'
 AND stream_id=e->>'streamId' AND producer_key=prepared->>'producerKey';
 IF FOUND THEN
  IF old.input_digest<>prepared->>'inputDigest' THEN RAISE EXCEPTION 'EVENT_KEY_CONFLICT'; END IF;
  RETURN jsonb_build_object('id',old.id,'streamId',old.event->>'streamId','sequence',old.event->>'sequence');
 END IF;
 FOR parent_id IN SELECT value::uuid FROM jsonb_array_elements_text(e->'parentIds') LOOP
  IF research_parent_run(parent_id)<>sc->>'runId' THEN RAISE EXCEPTION 'EVIDENCE_PARENT_SCOPE'; END IF;
 END LOOP;
 INSERT INTO research_evidence_streams(run_id,stream_id,last_sequence) VALUES(sc->>'runId',e->>'streamId',1)
 ON CONFLICT(run_id,stream_id) DO UPDATE SET last_sequence=research_evidence_streams.last_sequence+1
 RETURNING last_sequence INTO seq;
 UPDATE research_runs SET next_ordinal=next_ordinal+1 WHERE run_id=sc->>'runId' RETURNING next_ordinal INTO ord;
 e:=e||jsonb_build_object('sequence',seq::text,'ordinal',ord::text);
 INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event)
 VALUES((e->>'id')::uuid,sc->>'runId',e->>'streamId',seq,ord,prepared->>'producerKey',prepared->>'inputDigest',e);
 RETURN jsonb_build_object('id',e->>'id','streamId',e->>'streamId','sequence',seq::text);
END $$;

