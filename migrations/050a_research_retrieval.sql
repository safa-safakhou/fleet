-- A narrowly scoped definer function permits GIN use without marking PostgreSQL FTS operators leakproof.
CREATE OR REPLACE FUNCTION research_fts_candidates(config regconfig,query text) RETURNS TABLE(id text,version text,lexical_score double precision)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ns text;
BEGIN
 SELECT t.namespace INTO ns FROM public.research_index_tickets t JOIN public.research_index_grants g ON g.namespace=t.namespace AND g.id=t.policy_id JOIN public.cohorts c ON c.id=g.cohort_id
 WHERE t.token=current_setting('fleet.research.ticket',true) AND t.transaction_id=pg_current_xact_id()::text AND c.observation_consent AND c.observation_consent_version=g.consent_version;
 IF ns IS NULL THEN RETURN;END IF;
 RETURN QUERY SELECT p.memory_id::text,p.version::text,ts_rank_cd(p.lexemes,plainto_tsquery(config,query))::double precision
 FROM public.research_memory_projections p WHERE p.namespace=ns AND p.language=config AND p.lexemes @@ plainto_tsquery(config,query) AND public.research_projection_visible(p.namespace,p.policy_id,p.memory_id)
 ORDER BY p.memory_id LIMIT 501;
END $$;
REVOKE ALL ON FUNCTION research_fts_candidates(regconfig,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION research_fts_candidates(regconfig,text) TO fleet_research_index;
