CREATE TABLE IF NOT EXISTS research_operations (
 operation_id text PRIMARY KEY, task_id uuid NOT NULL REFERENCES platform_tasks(id),
 scope jsonb NOT NULL, authority jsonb NOT NULL,
 manifest_digest text NOT NULL REFERENCES research_manifests(digest)
);
CREATE TABLE IF NOT EXISTS research_steps (
 operation_id text NOT NULL REFERENCES research_operations(operation_id), logical_step_id text NOT NULL,
 original_epoch text NOT NULL CHECK(original_epoch ~ '^(0|[1-9][0-9]*)$'),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(result->>'status' IN ('pending','unknown','completed','not_dispatched')),
 PRIMARY KEY(operation_id,logical_step_id)
);
