-- Fleet-owned, invoker-rights operations. No keys/plaintext or external effects.
-- Existing binding creation stays in the typed repository; every use revalidates.
CREATE OR REPLACE FUNCTION research_scope_snapshot(sc jsonb, lock_run boolean) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE b record;
BEGIN
 IF lock_run THEN PERFORM 1 FROM research_runs WHERE run_id=sc->>'runId' FOR UPDATE; END IF;
 SELECT t.agent_id,t.cohort_id,r.agent_id run_agent_id,r.cohort_id run_cohort_id,
 r.binding_id,r.manifest_digest,s.scope=sc scope_valid,
 CASE WHEN o.scope IS NOT NULL THEN
 (o.scope-'turnId'-'operationEpoch')=(sc-'turnId'-'operationEpoch') AND
 EXISTS(SELECT 1 FROM platform_task_claims c JOIN platform_tasks task ON task.id=c.task_id
 WHERE c.turn_id=(sc->>'turnId')::uuid AND c.task_id::text=sc->>'taskId'
 AND c.fence::text=sc->>'operationEpoch' AND task.binding_id::text=sc->>'bindingId')
 ELSE (SELECT prior.scope FROM research_evidence_scopes prior JOIN research_runs pr ON pr.run_id=prior.run_id
 WHERE prior.turn_id=(sc->>'turnId')::uuid ORDER BY (pr.provenance='research') DESC,prior.epoch DESC LIMIT 1)=sc END authority_valid
 INTO b FROM research_runs r JOIN research_evidence_scopes s ON s.run_id=r.run_id
 AND s.operation_id=sc->>'operationId' AND s.epoch=sc->>'operationEpoch'
 JOIN turns t ON t.id=(sc->>'turnId')::uuid LEFT JOIN research_operations o ON o.operation_id=sc->>'operationId'
 WHERE r.run_id=sc->>'runId';
 IF NOT FOUND THEN RETURN false; END IF;
 IF b.agent_id::text<>sc->>'agentId' OR b.run_agent_id::text<>sc->>'agentId'
 OR b.cohort_id<>b.run_cohort_id OR b.binding_id<>sc->>'bindingId'
 OR b.manifest_digest<>sc->>'manifestDigest' OR NOT COALESCE(b.scope_valid,false)
 OR NOT COALESCE(b.authority_valid,false) THEN RAISE EXCEPTION 'EVIDENCE_SCOPE_MISMATCH'; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION research_bind_existing_scope(sc jsonb) RETURNS boolean
LANGUAGE sql AS $$ SELECT research_scope_snapshot(sc,true) $$;

CREATE OR REPLACE FUNCTION research_append_event(sc jsonb, prepared jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE e jsonb:=prepared->'event'; old record; seq bigint; ord bigint; foreign_found boolean;
BEGIN
 IF NOT research_bind_existing_scope(sc) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 SELECT id,input_digest,event INTO old FROM research_events WHERE run_id=sc->>'runId'
 AND stream_id=e->>'streamId' AND producer_key=prepared->>'producerKey';
 IF FOUND THEN
  IF old.input_digest<>prepared->>'inputDigest' THEN RAISE EXCEPTION 'EVENT_KEY_CONFLICT'; END IF;
  RETURN jsonb_build_object('id',old.id,'streamId',old.event->>'streamId','sequence',old.event->>'sequence');
 END IF;
 SELECT EXISTS(SELECT 1 FROM research_events WHERE id IN
 (SELECT value::uuid FROM jsonb_array_elements_text(e->'parentIds')) AND run_id<>sc->>'runId') INTO foreign_found;
 IF foreign_found THEN RAISE EXCEPTION 'EVIDENCE_PARENT_SCOPE'; END IF;
 INSERT INTO research_evidence_streams(run_id,stream_id,last_sequence) VALUES(sc->>'runId',e->>'streamId',1)
 ON CONFLICT(run_id,stream_id) DO UPDATE SET last_sequence=research_evidence_streams.last_sequence+1
 RETURNING last_sequence INTO seq;
 UPDATE research_runs SET next_ordinal=next_ordinal+1 WHERE run_id=sc->>'runId' RETURNING next_ordinal INTO ord;
 e:=e||jsonb_build_object('sequence',seq::text,'ordinal',ord::text);
 INSERT INTO research_events(id,run_id,stream_id,sequence,ordinal,producer_key,input_digest,event)
 VALUES((e->>'id')::uuid,sc->>'runId',e->>'streamId',seq,ord,prepared->>'producerKey',prepared->>'inputDigest',e);
 RETURN jsonb_build_object('id',e->>'id','streamId',e->>'streamId','sequence',seq::text);
END $$;

CREATE OR REPLACE FUNCTION research_capture_policy(sc jsonb) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE policy jsonb;
BEGIN
 IF NOT research_scope_snapshot(sc,false) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 SELECT jsonb_build_object('allowed',c.observation_consent,'version',c.observation_consent_version::text,
 'quota',COALESCE(r.artifact_quota_bytes,1073741824)::text) INTO policy
 FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id WHERE r.run_id=sc->>'runId';
 RETURN policy;
END $$;

-- Acknowledge only duplicate SQL copies already fsynced and verified by Fleet.
-- Locked rows are left for ordinary outbox reconciliation; no native work waits.
CREATE OR REPLACE FUNCTION research_acknowledge_copies(copies jsonb) RETURNS void
LANGUAGE sql AS $$
 WITH ready AS MATERIALIZED (
 SELECT a.id FROM research_artifacts a JOIN jsonb_to_recordset(copies) p(id uuid,digest text)
 ON p.id=a.id AND p.digest=a.ciphertext_digest
 WHERE a.inline_cipher IS NOT NULL AND a.status='complete'
 FOR UPDATE OF a SKIP LOCKED
 ) UPDATE research_artifacts a SET inline_cipher=NULL FROM ready WHERE a.id=ready.id
$$;

CREATE OR REPLACE FUNCTION research_capture_write(sc jsonb, prepared jsonb, started jsonb,
 artifact jsonb, consent_version text, quota bigint, at_time timestamptz,
 copies jsonb DEFAULT '[]'::jsonb, before_event jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE existing_hash text; c record; r record; amount bigint;
BEGIN
 IF NOT research_bind_existing_scope(sc) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 PERFORM research_acknowledge_copies(copies);
 SELECT input_digest INTO existing_hash FROM research_events WHERE run_id=sc->>'runId'
 AND stream_id='run' AND producer_key='capture-start';
 IF FOUND THEN
  IF existing_hash<>started->>'inputDigest' THEN RAISE EXCEPTION 'EVENT_KEY_CONFLICT'; END IF;
 ELSE PERFORM research_append_event(sc,started); END IF;
 IF before_event IS NOT NULL THEN PERFORM research_append_event(sc,before_event); END IF;
 IF artifact IS NOT NULL THEN
  SELECT co.observation_consent,co.observation_consent_version::text version INTO c
  FROM cohorts co JOIN research_runs rr ON rr.cohort_id=co.id WHERE rr.run_id=sc->>'runId' FOR SHARE OF co;
  IF NOT c.observation_consent OR c.version<>consent_version THEN RAISE EXCEPTION 'ARTIFACT_WITHHELD'; END IF;
  SELECT artifact_reserved_bytes,artifact_quota_bytes INTO r FROM research_runs WHERE run_id=sc->>'runId' FOR UPDATE;
  amount:=(artifact->'ref'->>'bytes')::bigint;
  IF quota<0 OR amount<0 OR amount>33554432 THEN RAISE EXCEPTION 'ARTIFACT_QUOTA'; END IF;
  IF r.artifact_quota_bytes IS NOT NULL AND r.artifact_quota_bytes<>quota THEN RAISE EXCEPTION 'ARTIFACT_QUOTA_POLICY_MISMATCH'; END IF;
  IF r.artifact_reserved_bytes+amount>quota THEN RAISE EXCEPTION 'ARTIFACT_QUOTA'; END IF;
  INSERT INTO research_artifacts(id,run_id,scope,consent_version,content_type,privacy_class,retention_class,status,
  reserved_bytes,bytes,disk_bytes,chunks,inline_cipher,ciphertext_digest,created_at,expires_at,expected_bytes)
  VALUES((artifact->'ref'->>'id')::uuid,sc->>'runId',sc,consent_version::bigint,'application/json','private','30d','complete',
  amount,amount,(artifact->>'disk')::bigint,artifact->'chunks',artifact->'ciphers',artifact->>'cipherDigest',at_time,at_time+interval '720 hours',amount);
  UPDATE research_runs SET artifact_reserved_bytes=artifact_reserved_bytes+amount,artifact_quota_bytes=quota WHERE run_id=sc->>'runId';
 END IF;
 RETURN research_append_event(sc,prepared);
END $$;

-- Final publication check: scope, consent and retention remain authoritative.
CREATE OR REPLACE FUNCTION research_verify_materialization(sc jsonb, artifact_id uuid,
 expected_version text, expected_digest text, at_time timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE c record; a record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM research_evidence_scopes s WHERE s.run_id=sc->>'runId'
 AND s.operation_id=sc->>'operationId' AND s.epoch=sc->>'operationEpoch' AND s.scope=sc)
 THEN RAISE EXCEPTION 'EVIDENCE_SCOPE_MISMATCH'; END IF;
 SELECT co.observation_consent,co.observation_consent_version::text version INTO c
 FROM cohorts co JOIN research_runs r ON r.cohort_id=co.id WHERE r.run_id=sc->>'runId';
 IF NOT c.observation_consent OR c.version<>expected_version THEN RAISE EXCEPTION 'ARTIFACT_WITHHELD'; END IF;
 SELECT * INTO a FROM research_artifacts WHERE id=artifact_id AND run_id=sc->>'runId';
 IF NOT FOUND OR a.scope<>sc THEN RAISE EXCEPTION 'ARTIFACT_SCOPE_MISMATCH'; END IF;
 IF a.status='withheld' OR a.consent_version::text<>expected_version THEN RAISE EXCEPTION 'ARTIFACT_WITHHELD'; END IF;
 IF a.status='expired' OR a.expires_at<=at_time THEN RAISE EXCEPTION 'ARTIFACT_EXPIRED'; END IF;
 IF a.status<>'complete' OR a.purged THEN RAISE EXCEPTION 'ARTIFACT_INCOMPLETE'; END IF;
 IF a.ciphertext_digest<>expected_digest THEN RAISE EXCEPTION 'ARTIFACT_INTEGRITY'; END IF;
END $$;

CREATE OR REPLACE FUNCTION research_model_capture_policy(sc jsonb, allocation_id uuid, copied uuid[]) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
 IF NOT research_scope_snapshot(sc,false) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 SELECT jsonb_build_object('failed',r.capture_failed,'allowed',c.observation_consent,
 'version',c.observation_consent_version::text,'quota',COALESCE(r.artifact_quota_bytes,1073741824)::text,
 'allocationId',l.id,'metrics',l.request_metrics,
 'pending',EXISTS(SELECT 1 FROM research_artifacts a WHERE a.run_id=r.run_id AND a.status='complete'
 AND a.inline_cipher IS NOT NULL AND NOT(a.id=ANY(copied)))) INTO result
 FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id LEFT JOIN LATERAL
 (SELECT id,request_metrics FROM compute_ledger WHERE
 (allocation_id IS NOT NULL AND id=allocation_id) OR
 (allocation_id IS NULL AND turn_id=(sc->>'turnId')::uuid AND status='reserved')
 ORDER BY created_at DESC,id DESC LIMIT 1) l ON true WHERE r.run_id=sc->>'runId';
 RETURN result;
END $$;
