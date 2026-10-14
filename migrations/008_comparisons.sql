CREATE TABLE IF NOT EXISTS comparisons (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 template jsonb NOT NULL,
 digest text NOT NULL,
 llm_cohort_id uuid NOT NULL UNIQUE REFERENCES cohorts(id),
 cognition_cohort_id uuid NOT NULL UNIQUE REFERENCES cohorts(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(llm_cohort_id <> cognition_cohort_id)
);
