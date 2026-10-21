-- One-shot protocol authorization control. No parallel spend/budget ledger.
CREATE TABLE IF NOT EXISTS negotiation_protocol_batches (
 nonce uuid PRIMARY KEY,protocol_digest text NOT NULL,grant_digest text NOT NULL,
 status text NOT NULL CHECK(status IN('consumed','complete','stopped')),
 consumed_at timestamptz NOT NULL,finished_at timestamptz,result_digest text
);
