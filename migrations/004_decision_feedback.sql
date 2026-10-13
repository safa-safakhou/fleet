ALTER TABLE agents ADD COLUMN IF NOT EXISTS decision_feedback_cipher text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS decision_feedback_at timestamptz;
