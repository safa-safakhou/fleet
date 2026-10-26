-- Numeric operational metadata; no prompts, answers, reasoning text or credentials.
ALTER TABLE compute_ledger ADD COLUMN IF NOT EXISTS request_metrics jsonb CHECK(request_metrics IS NULL OR jsonb_typeof(request_metrics)='object');
ALTER TABLE compute_ledger ADD COLUMN IF NOT EXISTS response_metrics jsonb CHECK(response_metrics IS NULL OR jsonb_typeof(response_metrics)='object');
CREATE INDEX IF NOT EXISTS compute_ledger_metrics_time ON compute_ledger(created_at DESC,cohort_id);
