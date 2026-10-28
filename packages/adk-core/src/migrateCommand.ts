import fs from 'node:fs';
import path from 'node:path';
import type { CommandResult, JsonObject } from './types.ts';
import { commandResult, failure, operationalIssue, redactSecrets } from './issues.ts';
import { readDevHostState } from './devHost.ts';
import { runProcess } from './processRun.ts';

const PROBE_MS = 8000;
const SQL_MS = 30000;
const UP_FILE = /^[0-9A-Za-z._-]+\.up\.sql$/;

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
  return failure(message, 'Start the dev host with kassis-addon dev. migrate does not use any other database.', 'ADK-MIGRATE', data);
}

function containerRunning(runtime: string, containerId: string): boolean {
  const inspected = runProcess(runtime, ['inspect', '--format', '{{.State.Running}}', containerId], PROBE_MS);
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

function psql(runtime: string, containerId: string, variable: string, sql: string): { ok: boolean; stdout: string; stderr: string } {
  const result = runProcess(
    runtime,
    ['exec', '-i', containerId, 'sh', '-c', `psql "$${variable}" -q -t -A -v ON_ERROR_STOP=1 -f -`],
    SQL_MS,
    { input: sql }
  );
  return {
    ok: result.status === 0 && !result.timedOut,
    stdout: result.stdout,
    stderr: redactSecrets(result.timedOut ? 'psql did not finish' : result.stderr),
  };
}

function migrationFiles(dir: string): string[] {
  const folder = path.join(dir, 'migrations');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((name) => UP_FILE.test(name)).sort();
}

function appliedNames(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && UP_FILE.test(line));
}

const LEDGER = `CREATE TABLE IF NOT EXISTS _kassis_devhost_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);`;

function resolveTarget(runtime: string, containerId: string, target: string): CommandResult | DatabaseIdentity {
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
  if (action !== 'up' && action !== 'down' && action !== 'status') {
    return failure(
      'migrate needs up, down, or status',
      'Run kassis-addon migrate --help.',
      'ADK-USAGE'
    );
  }
  const state = readDevHostState();
  if (!state) return refuse('No dev host is running.');
  const resolved = resolveTarget(state.runtime, state.containerId, target);
  if ('ok' in resolved) return resolved;
  const files = migrationFiles(dir);
  if (action === 'status') return status(state.runtime, state.containerId, resolved, files);
  if (action === 'up') return up(dir, state.runtime, state.containerId, resolved, files);
  return down(dir, state.runtime, state.containerId, resolved, files);
}

function status(runtime: string, containerId: string, identity: DatabaseIdentity, files: readonly string[]): CommandResult {
  const listed = psql(
    runtime,
    containerId,
    identity.variable,
    'SELECT name FROM _kassis_devhost_migrations ORDER BY name;'
  );
  const missingTable = /does not exist/i.test(listed.stderr);
  if (!listed.ok && !missingTable) {
    return refuse(`Could not read migration status. ${listed.stderr.trim()}`.trim(), {
      host: identity.host,
      database: identity.name,
    });
  }
  const applied = new Set(missingTable ? [] : appliedNames(listed.stdout));
  const lines = files.map((name) => `${applied.has(name) ? 'applied' : 'pending'} ${name}`);
  return commandResult([], { host: identity.host, database: identity.name, lines });
}

function up(
  dir: string,
  runtime: string,
  containerId: string,
  identity: DatabaseIdentity,
  files: readonly string[]
): CommandResult {
  const current = status(runtime, containerId, identity, files);
  if (!current.ok) return current;
  const lines = Array.isArray(current.data.lines) ? current.data.lines.filter((line) => typeof line === 'string') : [];
  const pending = lines
    .filter((line) => line.startsWith('pending '))
    .map((line) => line.slice('pending '.length));
  const applied: string[] = [];
  for (const name of pending) {
    const sql = `${LEDGER}\n${fs.readFileSync(path.join(dir, 'migrations', name), 'utf8')}\nINSERT INTO _kassis_devhost_migrations (name) VALUES ('${name}');\n`;
    const result = psql(runtime, containerId, identity.variable, sql);
    if (!result.ok) {
      return commandResult(
        [
          operationalIssue(
            'ADK-MIGRATE',
            'error',
            `Could not apply ${name}. ${result.stderr.trim()}`.trim(),
            'Fix the up script. The dev host database was the only target.',
            path.join('migrations', name),
            null
          ),
        ],
        { host: identity.host, database: identity.name, applied }
      );
    }
    applied.push(name);
  }
  return commandResult([], { host: identity.host, database: identity.name, applied });
}

function down(
  dir: string,
  runtime: string,
  containerId: string,
  identity: DatabaseIdentity,
  files: readonly string[]
): CommandResult {
  const listed = psql(
    runtime,
    containerId,
    identity.variable,
    'SELECT name FROM _kassis_devhost_migrations ORDER BY applied_at DESC LIMIT 1;'
  );
  if (!listed.ok) {
    return refuse(`Could not read the dev host ledger. ${listed.stderr.trim()}`.trim());
  }
  const name = appliedNames(listed.stdout)[0] ?? '';
  if (!name) return commandResult([], { host: identity.host, database: identity.name, reverted: '' });
  if (!files.includes(name)) {
    return refuse(`${name} is not an up script in this addon.`, { host: identity.host, database: identity.name });
  }
  const downName = name.replace(/\.up\.sql$/, '.down.sql');
  const downFile = path.join(dir, 'migrations', downName);
  if (!fs.existsSync(downFile)) {
    return commandResult(
      [
        operationalIssue(
          'ADK-MIGRATION',
          'error',
          `${name} has no down script`,
          'Add the matching .down.sql file before migrate down.',
          path.join('migrations', downName),
          null
        ),
      ],
      { host: identity.host, database: identity.name }
    );
  }
  const sql = `${fs.readFileSync(downFile, 'utf8')}\nDELETE FROM _kassis_devhost_migrations WHERE name = '${name}';\n`;
  const result = psql(runtime, containerId, identity.variable, sql);
  if (!result.ok) {
    return refuse(`Could not revert ${name}. ${result.stderr.trim()}`.trim(), {
      host: identity.host,
      database: identity.name,
    });
  }
  return commandResult([], { host: identity.host, database: identity.name, reverted: name });
}
