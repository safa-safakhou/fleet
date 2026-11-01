-- Existing artifacts keep their filesystem/outbox semantics. No payload is moved.
ALTER TABLE research_artifacts ADD COLUMN IF NOT EXISTS storage_backend text NOT NULL DEFAULT 'filesystem'
 CHECK(storage_backend IN ('filesystem','postgres'));

-- Canonical SQL publication validates the stored representation, not a cached
-- client copy. SHA-256 is PostgreSQL's built-in function; no extension or key.
CREATE OR REPLACE FUNCTION research_verify_postgres_artifact(sc jsonb, artifact_id uuid,
 expected_version text, ref jsonb, at_time timestamptz) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE a record; ch jsonb; cipher text; total_bytes bigint:=0; total_disk bigint:=0; joined text:=''; i integer:=0;
BEGIN
 PERFORM research_verify_materialization(sc,artifact_id,expected_version,ref->>'ciphertextDigest',at_time);
 SELECT * INTO a FROM research_artifacts WHERE id=artifact_id AND run_id=sc->>'runId';
 IF a.storage_backend<>'postgres' OR a.inline_cipher IS NULL OR jsonb_typeof(a.inline_cipher)<>'array'
 OR a.disk_bytes>65536 OR a.disk_bytes<0 OR jsonb_typeof(a.chunks)<>'array'
 OR jsonb_array_length(a.inline_cipher)<>jsonb_array_length(a.chunks)
 OR ref<>jsonb_build_object('id',a.id,'contentType',a.content_type,'bytes',a.bytes::text,
 'chunks',jsonb_array_length(a.chunks)::text,'ciphertextDigest',a.ciphertext_digest,
 'privacyClass',a.privacy_class,'retentionClass',a.retention_class)
 THEN RAISE EXCEPTION 'ARTIFACT_INTEGRITY'; END IF;
 FOR ch IN SELECT value FROM jsonb_array_elements(a.chunks) LOOP
  cipher:=a.inline_cipher->>i;
  IF NOT COALESCE(cipher IS NOT NULL AND (ch->>'index')::integer=i AND (ch->>'bytes')::bigint BETWEEN 1 AND 1048576
  AND octet_length(cipher)=(ch->>'diskBytes')::bigint
  AND encode(sha256(convert_to(cipher,'UTF8')),'hex')=ch->>'digest',false)
  THEN RAISE EXCEPTION 'ARTIFACT_INTEGRITY'; END IF;
  total_bytes:=total_bytes+(ch->>'bytes')::bigint;
  total_disk:=total_disk+octet_length(cipher); joined:=joined||cipher; i:=i+1;
 END LOOP;
 IF total_bytes<>a.bytes OR total_disk<>a.disk_bytes OR a.expected_bytes<>a.bytes
 OR a.reserved_bytes<>a.bytes OR encode(sha256(convert_to(joined,'UTF8')),'hex')<>a.ciphertext_digest
 THEN RAISE EXCEPTION 'ARTIFACT_INTEGRITY'; END IF;
END $$;

CREATE OR REPLACE FUNCTION research_acknowledge_copy(artifact_id uuid, expected_digest text) RETURNS void
LANGUAGE sql AS $$
 WITH ready AS MATERIALIZED (
 SELECT id FROM research_artifacts WHERE id=artifact_id AND ciphertext_digest=expected_digest
 AND storage_backend='filesystem' AND inline_cipher IS NOT NULL AND status='complete' FOR UPDATE SKIP LOCKED
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
  reserved_bytes,bytes,disk_bytes,chunks,inline_cipher,ciphertext_digest,created_at,expires_at,expected_bytes,storage_backend)
  VALUES((artifact->'ref'->>'id')::uuid,sc->>'runId',sc,consent_version::bigint,'application/json','private','30d','complete',
  amount,amount,(artifact->>'disk')::bigint,artifact->'chunks',artifact->'ciphers',artifact->>'cipherDigest',at_time,at_time+interval '720 hours',amount,COALESCE(artifact->>'storageBackend','filesystem'));
  IF artifact->>'storageBackend'='postgres' THEN
   PERFORM research_verify_postgres_artifact(sc,(artifact->'ref'->>'id')::uuid,consent_version,artifact->'ref',at_time);
  END IF;
  UPDATE research_runs SET artifact_reserved_bytes=artifact_reserved_bytes+amount,artifact_quota_bytes=quota WHERE run_id=sc->>'runId';
 END IF;
 RETURN research_append_event(sc,prepared);
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
 AND a.storage_backend='filesystem' AND a.inline_cipher IS NOT NULL AND NOT(a.id=ANY(copied)))) INTO result
 FROM research_runs r JOIN cohorts c ON c.id=r.cohort_id LEFT JOIN LATERAL
 (SELECT id,request_metrics FROM compute_ledger WHERE
 (allocation_id IS NOT NULL AND id=allocation_id) OR
 (allocation_id IS NULL AND turn_id=(sc->>'turnId')::uuid AND status='reserved')
 ORDER BY created_at DESC,id DESC LIMIT 1) l ON true WHERE r.run_id=sc->>'runId';
 RETURN result;
END $$;
