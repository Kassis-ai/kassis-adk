export const FIND_BY_SENDER = `-- swift:find-by-sender-reference
SELECT id, status FROM swift_messages WHERE sender_bic = $1 AND reference = $2`;

export const INSERT_MESSAGE = `-- swift:insert-message
INSERT INTO swift_messages (
  id, message_type, reference, sender_bic, receiver_bic, value_date, currency, amount,
  ordering_customer, beneficiary, remittance_info, raw_text, high_value, status,
  approval_request_id, received_at, submitted_by
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
)
ON CONFLICT (sender_bic, reference) DO NOTHING`;

export const INSERT_HISTORY = `-- swift:insert-history
INSERT INTO swift_message_history (id, message_id, from_status, to_status, actor, at, comment)
VALUES ($1, $2, $3, $4, $5, $6, $7)`;

export const GET_MESSAGE = `-- swift:get
SELECT id, message_type, reference, sender_bic, receiver_bic, value_date, currency, amount,
       ordering_customer, beneficiary, remittance_info, raw_text, high_value, status,
       approval_request_id, received_at, decided_by, decided_at, decision_comment, submitted_by
FROM swift_messages WHERE id = $1`;

export const LIST_MESSAGES = `-- swift:list
SELECT id, message_type, reference, sender_bic, receiver_bic, value_date, currency, amount,
       high_value, status, received_at
FROM swift_messages
WHERE ($1::text IS NULL OR status = $1)
  AND ($2::text IS NULL OR message_type = $2)
  AND ($3::text IS NULL OR currency = $3)
  AND ($4::text IS NULL OR value_date >= $4)
  AND ($5::text IS NULL OR value_date <= $5)
ORDER BY received_at DESC
LIMIT $6 OFFSET $7`;

export const DECIDE_MESSAGE = `-- swift:decide
UPDATE swift_messages
SET status = $2, decided_by = $3, decided_at = $4, decision_comment = $5
WHERE id = $1 AND status = 'PENDING_APPROVAL'`;

export const EXPIRE_DUE = `-- swift:expire-due
SELECT id, received_at FROM swift_messages WHERE status = 'PENDING_APPROVAL' LIMIT 100`;

export const EXPIRE_ONE = `-- swift:expire-one
UPDATE swift_messages SET status = 'EXPIRED' WHERE id = $1 AND status = 'PENDING_APPROVAL'`;

export const DELETE_HISTORY = `-- swift:delete-history
DELETE FROM swift_message_history WHERE message_id = $1`;

export const DELETE_MESSAGE = `-- swift:delete-message
DELETE FROM swift_messages WHERE id = $1`;

export function sqlTag(sql: string): string {
  const line = sql.split('\n')[0] ?? '';
  return line.replace(/^--\s*/u, '').trim();
}
