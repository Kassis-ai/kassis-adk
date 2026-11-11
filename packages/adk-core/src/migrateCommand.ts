import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CommandResult, JsonObject } from './types.ts';
import { commandResult, failure, operationalIssue, redactSecrets } from './issues.ts';
import { readDevHostState } from './devHost.ts';
import { runProcess } from './processRun.ts';
import { planTransaction } from './sqlTransactionScan.ts';

const PROBE_MS = 8000;
const SQL_MS = 30000;
const UP_FILE = /^[0-9A-Za-z._-]+\.up\.sql$/;
/** Addon ids as manifests use them; safe to place in SQL literals. */
const ADDON_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Dev host only: legacy rows written before history was keyed by addon. */
const LEGACY_ADDON = '';

interface DatabaseIdentity {
  readonly host: string;
  readonly name: string;
  readonly variable: string;
}

function databaseIdentity(urlText: string): DatabaseIdentity | null {
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const name = parsed.pathname.replace(/^\//, '');
  if (!host || !name) return null;
  return { host, name, variable: '' };
}

/** A dotted hostname or a non-loopback IP is not the dev host database. */
export function devDatabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host === 'db' || host === 'postgres' || host === 'database') return true;
  if (host.includes('.') || host.includes(':')) return false;
  if (/^\d+$/.test(host)) return false;
  return /^[a-z0-9-]+$/.test(host);
}

function refuse(message: string, data: JsonObject = {}): CommandResult {
  return failure(
    message,
    'Start the dev host with kassis-addon dev. migrate does not use any other database.',
    'ADK-MIGRATE',
    data
  );
}

function containerRunning(runtime: string, containerId: string): boolean {
  const inspected = runProcess(
    runtime,
    ['inspect', '--format', '{{.State.Running}}', containerId],
    PROBE_MS
  );
  if (inspected.timedOut || inspected.missing || inspected.status !== 0) return false;
  return inspected.stdout.trim() === 'true';
}

function readDatabase(runtime: string, containerId: string): DatabaseIdentity | null {
  const names = ['DATABASE_URL', 'KASSIS_DATABASE_URL', 'POSTGRES_URL'];
  for (const variable of names) {
    const printed = runProcess(runtime, ['exec', containerId, 'printenv', variable], PROBE_MS);
    if (printed.timedOut || printed.status !== 0) continue;
    const identity = databaseIdentity(printed.stdout.trim());
    if (!identity || !devDatabaseHost(identity.host)) continue;
    return { ...identity, variable };
  }
  return null;
}

/** Sends one psql script to the dev host database; tests pass their own. */
export type SqlRunner = (sql: string) => { ok: boolean; stdout: string; stderr: string };

function devHostRunner(runtime: string, containerId: string, variable: string): SqlRunner {
  return (sql) => {
    const result = runProcess(
      runtime,
      [
        'exec',
        '-i',
        containerId,
        'sh',
        '-c',
        `psql "$${variable}" -X -q -t -A -v ON_ERROR_STOP=1 -f -`,
      ],
      SQL_MS,
      { input: sql }
    );
    return {
      ok: result.status === 0 && !result.timedOut,
      stdout: result.stdout,
      stderr: redactSecrets(result.timedOut ? 'psql did not finish' : result.stderr),
    };
  };
}

function migrationFiles(dir: string): string[] {
  const folder = path.join(dir, 'migrations');
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((name) => UP_FILE.test(name))
    .sort();
}

/** sha256 with BOM and line endings normalized (Windows and Linux agree). */
export function migrationChecksum(content: string): string {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function readAddonId(dir: string): string | null {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
  if (!manifest || typeof manifest !== 'object' || !('id' in manifest)) return null;
  const id = manifest.id;
  return typeof id === 'string' && ADDON_ID.test(id) ? id : null;
}

/**
 * History keyed by addon and migration name (F024). An older ADK created the
 * table keyed by name alone; its rows keep an empty addon id until a developer
 * claims them with `migrate claim`, because nothing records which addon wrote them.
 */
const LEDGER = `CREATE TABLE IF NOT EXISTS _kassis_devhost_migrations (
  addon_id text NOT NULL,
  name text NOT NULL,
  checksum text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (addon_id, name)
);
DO $kassis_ledger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = '_kassis_devhost_migrations' AND column_name = 'addon_id'
  ) THEN
    ALTER TABLE _kassis_devhost_migrations ADD COLUMN addon_id text NOT NULL DEFAULT '${LEGACY_ADDON}';
    ALTER TABLE _kassis_devhost_migrations ADD COLUMN checksum text;
    ALTER TABLE _kassis_devhost_migrations DROP CONSTRAINT IF EXISTS _kassis_devhost_migrations_pkey;
    ALTER TABLE _kassis_devhost_migrations ADD PRIMARY KEY (addon_id, name);
    ALTER TABLE _kassis_devhost_migrations ALTER COLUMN addon_id DROP DEFAULT;
  END IF;
END
$kassis_ledger$;`;

/** Serializes migrate runs for one addon on the dev host (F025). */
function lockStatement(addonId: string): string {
  return `SELECT pg_advisory_xact_lock(hashtext('kassis-devhost-migrate'), hashtext('${addonId}'));`;
}

interface LedgerRow {
  readonly addonId: string;
  readonly name: string;
  readonly checksum: string;
}

function readLedger(run: SqlRunner, addonId: string): { rows: LedgerRow[]; error: string } {
  const result = run(
    `\\set ON_ERROR_STOP on
BEGIN;
${lockStatement(addonId)}
${LEDGER}
COMMIT;
SELECT addon_id || '|' || name || '|' || coalesce(checksum, '') FROM _kassis_devhost_migrations
WHERE addon_id IN ('${addonId}', '${LEGACY_ADDON}') ORDER BY applied_at, name;`
  );
  if (!result.ok) return { rows: [], error: result.stderr.trim() };
  const rows = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split('|'))
    .filter((parts) => parts.length === 3 && UP_FILE.test(parts[1] ?? ''))
    .map(([rowAddon, name, checksum]) => ({
      addonId: rowAddon ?? '',
      name: name ?? '',
      checksum: checksum ?? '',
    }));
  return { rows, error: '' };
}

interface AddonContext {
  readonly dir: string;
  readonly addonId: string;
  readonly files: readonly string[];
  readonly data: JsonObject;
}

function issue(code: string, message: string, fix: string, file = ''): CommandResult {
  return commandResult([operationalIssue(code, 'error', message, fix, file, null)], {});
}

function withData(result: CommandResult, data: JsonObject): CommandResult {
  return { ...result, data: { ...data, ...result.data } };
}

/**
 * Status, up, down and claim for one addon against any SQL runner. The CLI
 * entry (migrateProject) supplies the dev host runner after checking the target.
 */
export function migrateWithRunner(
  dir: string,
  action: string,
  run: SqlRunner,
  data: JsonObject = {}
): CommandResult {
  if (action !== 'up' && action !== 'down' && action !== 'status' && action !== 'claim') {
    return failure(
      'migrate needs up, down, status or claim',
      'Run kassis-addon migrate --help.',
      'ADK-USAGE'
    );
  }
  const addonId = readAddonId(dir);
  if (!addonId) {
    return failure(
      'migrate needs manifest.json with a valid id (lowercase letters, digits and dashes)',
      'Run kassis-addon doctor in the addon folder.',
      'ADK-MIGRATE',
      data
    );
  }
  const context: AddonContext = {
    dir,
    addonId,
    files: migrationFiles(dir),
    data: { ...data, addonId },
  };
  const ledger = readLedger(run, addonId);
  if (ledger.error) {
    return refuse(`Could not read the dev host ledger. ${ledger.error}`.trim(), context.data);
  }
  if (action === 'claim') return claim(context, run, ledger.rows);
  const problems = ledgerProblems(context, ledger.rows);
  if (action === 'status') return status(context, ledger.rows, problems);
  if (problems.length) {
    return withData(
      issue(
        'ADK-MIGRATION',
        problems.join(' '),
        'Restore the applied file, or write a new migration for the change. Legacy rows: run migrate claim if they belong to this addon.'
      ),
      context.data
    );
  }
  if (action === 'up') return up(context, run, ledger.rows);
  return down(context, run, ledger.rows);
}

function ledgerProblems(context: AddonContext, rows: readonly LedgerRow[]): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (row.addonId === LEGACY_ADDON) {
      if (context.files.includes(row.name)) {
        problems.push(
          `${row.name} was recorded by an older ADK without an addon id, so it may belong to another addon.`
        );
      }
      continue;
    }
    const file = path.join(context.dir, 'migrations', row.name);
    if (!fs.existsSync(file)) continue;
    const checksum = migrationChecksum(fs.readFileSync(file, 'utf8'));
    if (row.checksum && row.checksum !== checksum) {
      problems.push(`${row.name} changed after it was applied.`);
    }
  }
  return problems;
}

function status(
  context: AddonContext,
  rows: readonly LedgerRow[],
  problems: readonly string[]
): CommandResult {
  const applied = new Set(
    rows.filter((row) => row.addonId === context.addonId).map((row) => row.name)
  );
  const legacy = new Set(rows.filter((row) => row.addonId === LEGACY_ADDON).map((row) => row.name));
  const lines = context.files.map((name) => {
    if (applied.has(name)) return `applied ${name}`;
    if (legacy.has(name)) return `unclaimed ${name}`;
    return `pending ${name}`;
  });
  return commandResult([], { ...context.data, lines, problems: [...problems] });
}

function up(context: AddonContext, run: SqlRunner, rows: readonly LedgerRow[]): CommandResult {
  const applied = new Set(
    rows.filter((row) => row.addonId === context.addonId).map((row) => row.name)
  );
  const done: string[] = [];
  for (const name of context.files.filter((file) => !applied.has(file))) {
    const relative = path.join('migrations', name);
    const content = fs.readFileSync(path.join(context.dir, relative), 'utf8');
    const plan = planTransaction(content);
    if (!plan.wrappable) {
      return withData(
        issue(
          'ADK-MIGRATION',
          `${name} cannot run in one transaction: ${plan.reasons.join('; ')}`,
          'Split the script so each migration is transactional.',
          relative
        ),
        { ...context.data, applied: done }
      );
    }
    const script = [
      '\\set ON_ERROR_STOP on',
      'BEGIN;',
      lockStatement(context.addonId),
      plan.body,
      ';',
      `INSERT INTO _kassis_devhost_migrations (addon_id, name, checksum) VALUES ('${context.addonId}', '${name}', '${migrationChecksum(content)}');`,
      'COMMIT;',
      '',
    ].join('\n');
    const result = run(script);
    if (!result.ok) {
      return withData(
        issue(
          'ADK-MIGRATE',
          `Could not apply ${name}; nothing from it was kept. ${result.stderr.trim()}`.trim(),
          'Fix the up script. The dev host database was the only target.',
          relative
        ),
        { ...context.data, applied: done }
      );
    }
    done.push(name);
  }
  return commandResult([], { ...context.data, applied: done });
}

function down(context: AddonContext, run: SqlRunner, rows: readonly LedgerRow[]): CommandResult {
  const own = rows.filter((row) => row.addonId === context.addonId);
  const latest = own.at(-1);
  if (!latest) return commandResult([], { ...context.data, reverted: '' });
  const name = latest.name;
  if (!context.files.includes(name)) {
    return refuse(`${name} is not an up script in this addon.`, context.data);
  }
  const downName = name.replace(/\.up\.sql$/, '.down.sql');
  const relative = path.join('migrations', downName);
  const downFile = path.join(context.dir, relative);
  if (!fs.existsSync(downFile)) {
    return withData(
      issue(
        'ADK-MIGRATION',
        `${name} has no down script`,
        'Add the matching .down.sql file before migrate down.',
        relative
      ),
      context.data
    );
  }
  const plan = planTransaction(fs.readFileSync(downFile, 'utf8'));
  if (!plan.wrappable) {
    return withData(
      issue(
        'ADK-MIGRATION',
        `${downName} cannot run in one transaction: ${plan.reasons.join('; ')}`,
        'Split the script so each migration is transactional.',
        relative
      ),
      context.data
    );
  }
  const script = [
    '\\set ON_ERROR_STOP on',
    'BEGIN;',
    lockStatement(context.addonId),
    plan.body,
    ';',
    `DELETE FROM _kassis_devhost_migrations WHERE addon_id = '${context.addonId}' AND name = '${name}';`,
    'COMMIT;',
    '',
  ].join('\n');
  const result = run(script);
  if (!result.ok) {
    return refuse(
      `Could not revert ${name}; nothing was changed. ${result.stderr.trim()}`.trim(),
      context.data
    );
  }
  return commandResult([], { ...context.data, reverted: name });
}

/** Assign legacy rows whose names are this addon's up scripts to this addon. */
function claim(context: AddonContext, run: SqlRunner, rows: readonly LedgerRow[]): CommandResult {
  const names = rows
    .filter((row) => row.addonId === LEGACY_ADDON && context.files.includes(row.name))
    .map((row) => row.name);
  if (names.length === 0) return commandResult([], { ...context.data, claimed: [] });
  const updates = names
    .map((name) => {
      const checksum = migrationChecksum(
        fs.readFileSync(path.join(context.dir, 'migrations', name), 'utf8')
      );
      return `UPDATE _kassis_devhost_migrations SET addon_id = '${context.addonId}', checksum = '${checksum}' WHERE addon_id = '${LEGACY_ADDON}' AND name = '${name}';`;
    })
    .join('\n');
  const result = run(
    `\\set ON_ERROR_STOP on\nBEGIN;\n${lockStatement(context.addonId)}\n${updates}\nCOMMIT;\n`
  );
  if (!result.ok)
    return refuse(`Could not claim legacy rows. ${result.stderr.trim()}`.trim(), context.data);
  return commandResult([], { ...context.data, claimed: names });
}

function resolveTarget(
  runtime: string,
  containerId: string,
  target: string
): CommandResult | DatabaseIdentity {
  if (!containerRunning(runtime, containerId)) {
    return refuse('No dev host is running.');
  }
  const identity = readDatabase(runtime, containerId);
  if (!identity) {
    return refuse('The dev host has no local database. migrate refuses any other target.');
  }
  if (target) {
    const requested = databaseIdentity(target);
    if (!requested || requested.host !== identity.host || requested.name !== identity.name) {
      return refuse('migrate refuses a target that is not the dev host database.');
    }
  }
  return identity;
}

export function migrateProject(dir: string, action: string, target: string): CommandResult {
  if (action !== 'up' && action !== 'down' && action !== 'status' && action !== 'claim') {
    return failure(
      'migrate needs up, down, status or claim',
      'Run kassis-addon migrate --help.',
      'ADK-USAGE'
    );
  }
  const state = readDevHostState();
  if (!state) return refuse('No dev host is running.');
  const resolved = resolveTarget(state.runtime, state.containerId, target);
  if ('ok' in resolved) return resolved;
  return migrateWithRunner(
    dir,
    action,
    devHostRunner(state.runtime, state.containerId, resolved.variable),
    { host: resolved.host, database: resolved.name }
  );
}
