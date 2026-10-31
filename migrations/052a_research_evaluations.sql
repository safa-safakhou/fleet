CREATE TABLE IF NOT EXISTS research_evaluation_budgets(id uuid PRIMARY KEY,max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 16),max_tokens bigint NOT NULL CHECK(max_tokens>0));
CREATE TABLE IF NOT EXISTS research_evaluation_grants (
 id uuid PRIMARY KEY,operation_id text NOT NULL REFERENCES research_operations(operation_id) ON DELETE CASCADE,
 budget_id uuid NOT NULL REFERENCES research_evaluation_budgets(id),dataset_digest text NOT NULL,mode text NOT NULL CHECK(mode='offline'),max_calls integer NOT NULL CHECK(max_calls BETWEEN 1 AND 16),created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS research_evaluation_calls (
 grant_id uuid NOT NULL REFERENCES research_evaluation_grants(id) ON DELETE CASCADE,logical_step_id text NOT NULL,
 input_digest text NOT NULL,dataset_id text NOT NULL,candidate_id text NOT NULL,case_id text NOT NULL,phase text NOT NULL,
 purpose text NOT NULL,token_reservation bigint NOT NULL,allocation_id uuid REFERENCES compute_ledger(id),status text NOT NULL CHECK(status IN('reserved','completed','not_dispatched','unknown')),
 created_at timestamptz NOT NULL,PRIMARY KEY(grant_id,logical_step_id)
);
REVOKE ALL ON research_evaluation_budgets,research_evaluation_grants,research_evaluation_calls FROM PUBLIC,fleet_research_index;
