-- Resolve fresh policy and the conditional event in the same locked statement.
-- Both candidate event digests are prepared by the existing typed recorder.
-- Withheld bodies are never inserted, including when encoding was impossible.
CREATE OR REPLACE FUNCTION research_capture_resolved(sc jsonb, prepared jsonb, started jsonb,
 artifact jsonb, withheld jsonb, required_body boolean, at_time timestamptz,
 copies jsonb, encoding_error text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE c record; ref jsonb;
BEGIN
 IF NOT research_bind_existing_scope(sc) THEN RAISE EXCEPTION 'EVIDENCE_RUN_NOT_FOUND'; END IF;
 SELECT co.observation_consent allowed,co.observation_consent_version::text version,
 COALESCE(r.artifact_quota_bytes,1073741824) quota INTO c
 FROM research_runs r JOIN cohorts co ON co.id=r.cohort_id WHERE r.run_id=sc->>'runId' FOR SHARE OF co;
 IF NOT c.allowed THEN
  IF required_body THEN RAISE EXCEPTION 'EVIDENCE_UNAVAILABLE'; END IF;
  ref:=research_capture_write(sc,withheld,started,NULL,NULL,NULL,at_time,copies,NULL);
  RETURN jsonb_build_object('ref',ref,'stored',false);
 END IF;
 IF encoding_error IS NOT NULL THEN RAISE EXCEPTION '%',encoding_error; END IF;
 IF artifact IS NULL THEN RAISE EXCEPTION 'ARTIFACT_INCOMPLETE'; END IF;
 ref:=research_capture_write(sc,prepared,started,artifact,c.version,c.quota,at_time,copies,NULL);
 RETURN jsonb_build_object('ref',ref,'stored',true,'version',c.version);
END $$;
