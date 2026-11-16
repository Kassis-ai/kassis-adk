-- Mode A tables for acme-swift-approval. Schema addon_acme_swift_approval.
CREATE TABLE IF NOT EXISTS addon_acme_swift_approval.swift_messages (
  id uuid PRIMARY KEY,
  message_type text NOT NULL,
  reference text NOT NULL,
  sender_bic text NOT NULL,
  receiver_bic text NOT NULL,
  value_date date NOT NULL,
  currency char(3) NOT NULL,
  amount numeric(18,2) NOT NULL,
  ordering_customer text,
  beneficiary text NOT NULL,
  remittance_info text,
  raw_text text NOT NULL,
  high_value boolean NOT NULL,
  status text NOT NULL,
  approval_request_id text,
  received_at timestamptz NOT NULL,
  decided_by text,
  decided_at timestamptz,
  decision_comment text,
  submitted_by text,
  UNIQUE (sender_bic, reference)
);

CREATE INDEX IF NOT EXISTS swift_messages_status_idx
  ON addon_acme_swift_approval.swift_messages (status);

CREATE INDEX IF NOT EXISTS swift_messages_received_at_idx
  ON addon_acme_swift_approval.swift_messages (received_at);

CREATE TABLE IF NOT EXISTS addon_acme_swift_approval.swift_message_history (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES addon_acme_swift_approval.swift_messages (id),
  from_status text,
  to_status text NOT NULL,
  actor text NOT NULL,
  at timestamptz NOT NULL,
  comment text
);
