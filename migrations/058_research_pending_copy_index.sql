-- Canonical SQL bodies are retained rather than drained. Pending publication
-- must inspect only the filesystem outbox, independent of either tier's history.
CREATE INDEX IF NOT EXISTS research_artifact_pending_copy
 ON research_artifacts(run_id,created_at,id)
 WHERE storage_backend='filesystem' AND inline_cipher IS NOT NULL AND status='complete';
