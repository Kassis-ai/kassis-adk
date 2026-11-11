/**
 * Transaction-boundary scan for addon migration SQL (B23 / F025).
 *
 * TypeScript copy of scripts/deploy/sqlTransactionScan.mjs, because the ADK
 * ships on its own. __tests__/unit/backend/ops/sqlTransactionScan.test.js runs
 * both over every release step and its fixtures and fails if they disagree.
 *
 * Original notes:
 *
 * The release runner commits each SQL step together with its ledger row, so it
 * must know where a script opens and closes its own transaction. This module
 * splits a psql script into top-level statements and meta-commands, skipping
 * string literals, quoted identifiers, comments and dollar-quoted bodies, so a
 * `BEGIN` inside a DO block or function is not mistaken for a transaction.
 *
 * It is a boundary scanner, not a SQL parser: it only needs the leading words
 * of each top-level statement.
 */

export type ScriptItem =
  | { type: 'sql'; text: string; start: number; end: number }
  | { type: 'meta'; command: string; text: string; start: number; end: number };

/**
 * Meta-commands the runner can execute inside its own transaction. Anything
 * else (\connect, \i, \q, \!, ...) either changes session or reads unscanned
 * input, so a step using it must run with "transaction": "none".
 */
const WRAPPABLE_META = new Set([
  'set',
  'unset',
  'if',
  'elif',
  'else',
  'endif',
  'gset',
  'echo',
  'warn',
  'qecho',
  'pset',
  'timing',
  'g',
]);

/** Meta-commands that end the SQL statement currently being collected. */
const META_TERMINATES_QUERY = new Set(['g', 'gset', 'gx', 'gexec', 'gdesc', 'crosstabview']);

export function splitPsqlScript(script: string): ScriptItem[] {
  const source = script.replace(/^\uFEFF/, '');
  const items: ScriptItem[] = [];
  let statementStart = -1;
  let i = 0;
  const n = source.length;

  const flushStatement = (end: number): void => {
    if (statementStart < 0) return;
    const text = source.slice(statementStart, end).trim();
    if (text) items.push({ type: 'sql', text, start: statementStart, end });
    statementStart = -1;
  };

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\\') {
      // psql meta-command: runs to the end of the line, also after a query
      // on the same line (`SELECT ... \gset`).
      const lineEnd = source.indexOf('\n', i);
      const end = lineEnd === -1 ? n : lineEnd;
      const text = source.slice(i, end).trim();
      const command = (text.match(/^\\([A-Za-z!?]+)/)?.[1] || text.slice(1, 2)).toLowerCase();
      if (META_TERMINATES_QUERY.has(command)) flushStatement(i);
      items.push({ type: 'meta', command, text, start: i, end });
      i = end;
      continue;
    }
    if (ch === '-' && next === '-') {
      const lineEnd = source.indexOf('\n', i);
      i = lineEnd === -1 ? n : lineEnd;
      continue;
    }
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (source[i] === '/' && source[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (source[i] === '*' && source[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (statementStart < 0) statementStart = i;

    if (ch === ';') {
      flushStatement(i);
      i += 1;
      continue;
    }
    if (ch === "'") {
      const escaped =
        i > 0 && /[eE]/.test(source[i - 1]) && !/[A-Za-z0-9_]/.test(source[i - 2] || '');
      i += 1;
      while (i < n) {
        if (escaped && source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === "'") {
          if (source[i + 1] === "'") {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      i += 1;
      while (i < n) {
        if (source[i] === '"') {
          if (source[i + 1] === '"') {
            i += 2;
            continue;
          }
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '$') {
      const tag = source.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      const prev = source[i - 1] || '';
      if (tag && !/[A-Za-z0-9_]/.test(prev)) {
        const close = source.indexOf(tag[0], i + tag[0].length);
        i = close === -1 ? n : close + tag[0].length;
        continue;
      }
    }
    i += 1;
  }
  flushStatement(n);
  return items;
}

function leadingWords(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 200);
}

/** Kind of transaction control a top-level statement is, if any. */
export function transactionControlKind(
  text: string
): 'begin' | 'commit' | 'rollback' | 'savepoint' | null {
  const words = leadingWords(text);
  if (/^(BEGIN|START TRANSACTION)\b/.test(words) && !/^BEGIN ATOMIC\b/.test(words)) return 'begin';
  if (/^(COMMIT|END)\b/.test(words) && !/^COMMIT PREPARED\b/.test(words)) return 'commit';
  if (/^(SAVEPOINT|RELEASE)\b/.test(words) || /^ROLLBACK (WORK |TRANSACTION )?TO\b/.test(words)) {
    return 'savepoint';
  }
  if (/^(ROLLBACK|ABORT)\b/.test(words)) return 'rollback';
  return null;
}

/** Statements PostgreSQL refuses inside a transaction block. */
const NON_TRANSACTIONAL = [
  /^VACUUM\b/,
  /^CREATE (UNIQUE )?INDEX CONCURRENTLY\b/,
  /^DROP INDEX CONCURRENTLY\b/,
  /^REINDEX\b.*\bCONCURRENTLY\b/,
  /^REFRESH MATERIALIZED VIEW CONCURRENTLY\b/,
  /^(CREATE|DROP|ALTER) DATABASE\b/,
  /^(CREATE|DROP) TABLESPACE\b/,
  /^ALTER SYSTEM\b/,
  /^(COMMIT|ROLLBACK) PREPARED\b/,
  /^PREPARE TRANSACTION\b/,
  /^CLUSTER\s*$/,
  /^CALL\b/,
];

export interface TransactionPlan {
  readonly wrappable: boolean;
  readonly ownTransaction: boolean;
  readonly reasons: readonly string[];
  readonly body: string;
}

/**
 * Decide whether the runner can execute a script inside its own transaction.
 *
 * A script may open and close one transaction itself (`BEGIN` … `COMMIT`, with
 * COMMIT as the last statement). Those two statements are removed so the
 * runner's transaction, which also writes the ledger row, encloses everything.
 * Any other shape (several transactions, ROLLBACK, statements after COMMIT,
 * non-transactional commands, session-changing meta-commands) is reported as
 * not wrappable; such a step must declare "transaction": "none".
 *
 */
export function planTransaction(script: string): TransactionPlan {
  const source = script.replace(/^\uFEFF/, '');
  const items = splitPsqlScript(source);
  const reasons: string[] = [];
  const sqlItems = items.filter(
    (item): item is Extract<ScriptItem, { type: 'sql' }> => item.type === 'sql'
  );

  for (const item of items) {
    if (item.type === 'meta' && !WRAPPABLE_META.has(item.command)) {
      reasons.push(
        `psql meta-command \\${item.command} cannot run inside the runner's transaction`
      );
    }
  }

  for (const item of sqlItems) {
    const words = leadingWords(item.text);
    if (NON_TRANSACTIONAL.some((pattern) => pattern.test(words))) {
      reasons.push(`statement cannot run in a transaction block: ${words.slice(0, 60)}`);
    }
  }

  const control = sqlItems
    .map((item, index) => ({ item, index, kind: transactionControlKind(item.text) }))
    .filter((entry) => entry.kind !== null && entry.kind !== 'savepoint');

  const remove: Array<{ start: number; end: number }> = [];
  let ownTransaction = false;
  if (control.length > 0) {
    const [first, second] = control;
    const shapeOk =
      control.length === 2 &&
      first.kind === 'begin' &&
      second.kind === 'commit' &&
      second.index === sqlItems.length - 1;
    if (!shapeOk) {
      reasons.push(
        `transaction control must be one BEGIN … COMMIT with COMMIT last; found ${control
          .map((entry) => leadingWords(entry.item.text).split(' ')[0])
          .join(', ')}`
      );
    } else {
      ownTransaction = true;
      for (const entry of [first, second]) {
        const semicolon = source.indexOf(';', entry.item.end);
        remove.push({
          start: entry.item.start,
          end: semicolon === -1 ? entry.item.end : semicolon + 1,
        });
      }
    }
  }

  let body = source;
  for (const range of remove.sort((a, b) => b.start - a.start)) {
    body = `${body.slice(0, range.start)}-- [release runner] transaction control removed\n${body.slice(range.end)}`;
  }

  return { wrappable: reasons.length === 0, ownTransaction, reasons, body };
}
