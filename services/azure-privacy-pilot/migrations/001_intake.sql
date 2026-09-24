CREATE TABLE azure_intake.handoff_nonces (
  nonce uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX handoff_nonces_expiry ON azure_intake.handoff_nonces (expires_at);

-- UUID subjects map to the existing identity provider, without importing its
-- auth schema, email addresses, document contents or payment records.
CREATE TABLE azure_intake.operations (
  operation_id uuid PRIMARY KEY,
  subject_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN
    ('contract_check', 'contract_improve', 'negotiation_package')),
  blob_name uuid NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'reserved' CHECK (state = 'reserved'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX operations_subject ON azure_intake.operations (subject_id, operation_id);
REVOKE ALL ON ALL TABLES IN SCHEMA azure_intake FROM PUBLIC;
