import { sqlTag } from '../src/server/messages/sql.ts';

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

export function createMemoryData(): {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: Row[] }>;
  execute(sql: string, params?: readonly unknown[]): Promise<{ count: number }>;
  transaction(
    statements: readonly { op: 'query' | 'execute'; sql: string; params?: readonly unknown[] }[]
  ): Promise<{ results: ({ rows: Row[] } | { count: number })[] }>;
  read(): Promise<{ rows: Row[] }>;
  messages: Row[];
  history: Row[];
} {
  const messages: Row[] = [];
  const history: Row[] = [];

  async function query(sql: string, params: readonly unknown[] = []): Promise<{ rows: Row[] }> {
    const tag = sqlTag(sql);
    if (tag === 'swift:find-by-sender-reference') {
      const found = messages.find(
        (row) => row.sender_bic === params[0] && row.reference === params[1]
      );
      return { rows: found ? [{ id: found.id, status: found.status }] : [] };
    }
    if (tag === 'swift:get') {
      const found = messages.find((row) => row.id === params[0]);
      return { rows: found ? [{ ...found }] : [] };
    }
    if (tag === 'swift:list') {
      const [status, messageType, currency, from, to, limit, offset] = params;
      const matched = messages.filter((row) => {
        if (status && row.status !== status) return false;
        if (messageType && row.message_type !== messageType) return false;
        if (currency && row.currency !== currency) return false;
        if (from && text(row.value_date) < text(from)) return false;
        if (to && text(row.value_date) > text(to)) return false;
        return true;
      });
      matched.sort((left, right) => text(right.received_at).localeCompare(text(left.received_at)));
      const start = Number(offset ?? 0);
      const end = start + Number(limit ?? 25);
      return { rows: matched.slice(start, end).map((row) => ({ ...row })) };
    }
    if (tag === 'swift:expire-due') {
      return {
        rows: messages
          .filter((row) => row.status === 'PENDING_APPROVAL')
          .slice(0, 100)
          .map((row) => ({ id: row.id, received_at: row.received_at })),
      };
    }
    return { rows: [] };
  }

  async function execute(sql: string, params: readonly unknown[] = []): Promise<{ count: number }> {
    const tag = sqlTag(sql);
    if (tag === 'swift:insert-message') {
      const exists = messages.some(
        (row) => row.sender_bic === params[3] && row.reference === params[2]
      );
      if (exists) return { count: 0 };
      messages.push({
        id: params[0],
        message_type: params[1],
        reference: params[2],
        sender_bic: params[3],
        receiver_bic: params[4],
        value_date: params[5],
        currency: params[6],
        amount: params[7],
        ordering_customer: params[8],
        beneficiary: params[9],
        remittance_info: params[10],
        raw_text: params[11],
        high_value: params[12],
        status: params[13],
        approval_request_id: params[14],
        received_at: params[15],
        submitted_by: params[16],
        decided_by: null,
        decided_at: null,
        decision_comment: null,
      });
      return { count: 1 };
    }
    if (tag === 'swift:insert-history') {
      history.push({
        id: params[0],
        message_id: params[1],
        from_status: params[2],
        to_status: params[3],
        actor: params[4],
        at: params[5],
        comment: params[6],
      });
      return { count: 1 };
    }
    if (tag === 'swift:decide') {
      const found = messages.find((row) => row.id === params[0] && row.status === 'PENDING_APPROVAL');
      if (!found) return { count: 0 };
      found.status = params[1];
      found.decided_by = params[2];
      found.decided_at = params[3];
      found.decision_comment = params[4];
      return { count: 1 };
    }
    if (tag === 'swift:expire-one') {
      const found = messages.find((row) => row.id === params[0] && row.status === 'PENDING_APPROVAL');
      if (!found) return { count: 0 };
      found.status = 'EXPIRED';
      return { count: 1 };
    }
    if (tag === 'swift:delete-history') {
      const before = history.length;
      for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index]?.message_id === params[0]) history.splice(index, 1);
      }
      return { count: before - history.length };
    }
    if (tag === 'swift:delete-message') {
      const index = messages.findIndex((row) => row.id === params[0]);
      if (index < 0) return { count: 0 };
      messages.splice(index, 1);
      return { count: 1 };
    }
    return { count: 0 };
  }

  return {
    messages,
    history,
    query,
    execute,
    async transaction(statements) {
      const results = [];
      for (const statement of statements) {
        results.push(
          statement.op === 'query'
            ? await query(statement.sql, statement.params)
            : await execute(statement.sql, statement.params)
        );
      }
      return { results };
    },
    async read() {
      return { rows: [] };
    },
  };
}
