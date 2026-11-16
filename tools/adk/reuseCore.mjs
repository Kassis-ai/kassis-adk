/**
 * Group A guardrails: banned dependencies (L2) and private mechanism tables (L3,
 * explained override is L4). Owned tables need a manifest note of the core record
 * they could not be (L4 warning).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kadkIssue } from './certifyAttestation.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const besideList = path.join(here, 'banned-dependencies.json');
const repoList =
  globalThis.__KASSIS_ADK_PACKED__ === true
    ? ''
    : path.resolve(here, '../../packages/addon-sdk/banned-dependencies.json');
const bannedList = require(fs.existsSync(repoList) ? repoList : besideList);

const CREATE_TABLE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?("?[A-Za-z_][\w]*"?\.)?"?([A-Za-z_][\w]*)"?/gi;
const REUSE_ROW = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/;
const MIN_REASON = 15;

const MECHANISM_EXACT = [
  ['approval', /^(approvals?|status_histories|status_history)$/],
  ['notification', /^notifications?$/],
  ['audit', /^(audit|audit_logs?|audit_events?|audit_trail)$/],
  ['user', /^users?$/],
  ['role', /^roles?$/],
];

function bannedIndex() {
  const index = new Map();
  const categories = bannedList.categories;
  if (!categories || typeof categories !== 'object') return index;
  for (const [category, names] of Object.entries(categories)) {
    if (!Array.isArray(names)) continue;
    for (const name of names) {
      if (typeof name === 'string' && name.length > 0) index.set(name, category);
    }
  }
  return index;
}

const BANNED = bannedIndex();

function mechanismOf(table) {
  const bare = table.split('.').pop().toLowerCase();
  for (const [name, pattern] of MECHANISM_EXACT) {
    if (pattern.test(bare)) return name;
  }
  if (/_approvals?$|_status_history$/.test(bare)) return 'approval';
  if (/_notifications?$/.test(bare)) return 'notification';
  if (/_audit_logs?$|_audit$/.test(bare)) return 'audit';
  if (/_users?$/.test(bare)) return 'user';
  if (/_roles?$/.test(bare)) return 'role';
  return '';
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function dependencyNames(pkg) {
  const names = [];
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const name of Object.keys(block)) names.push(name);
  }
  return names;
}

function sqlTables(addonDir) {
  const dir = path.join(addonDir, 'migrations');
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.sql')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    const stripped = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    let match = CREATE_TABLE.exec(stripped);
    while (match !== null) {
      const schema = match[1] ? match[1].replace(/"/g, '').replace(/\.$/, '') : '';
      found.push(schema ? `${schema}.${match[2]}` : match[2]);
      match = CREATE_TABLE.exec(stripped);
    }
    CREATE_TABLE.lastIndex = 0;
  }
  return found;
}

function ownedTables(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];
  const database = manifest.database;
  if (!database || typeof database !== 'object' || !Array.isArray(database.ownedTables)) return [];
  return database.ownedTables.filter((item) => typeof item === 'string');
}

function tableNotes(manifest) {
  const notes = new Map();
  if (!manifest || typeof manifest !== 'object') return notes;
  const database = manifest.database;
  if (!database || typeof database !== 'object' || !Array.isArray(database.tableNotes)) return notes;
  for (const note of database.tableNotes) {
    if (!note || typeof note !== 'object') continue;
    const table = typeof note.table === 'string' ? note.table : '';
    const notCoreRecord = typeof note.notCoreRecord === 'string' ? note.notCoreRecord.trim() : '';
    const why = typeof note.why === 'string' ? note.why.trim() : '';
    if (table && notCoreRecord && why.length >= MIN_REASON) notes.set(table.toLowerCase(), true);
  }
  return notes;
}

function reuseOverrides(addonDir) {
  const file = path.join(addonDir, 'REUSE.md');
  const rows = [];
  if (!fs.existsSync(file)) return rows;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = REUSE_ROW.exec(line.trim());
    if (!match) continue;
    const table = match[1].trim();
    const mechanism = match[2].trim().toLowerCase();
    const reason = match[3].trim();
    if (table.toLowerCase() === 'table' || table.startsWith('-')) continue;
    if (reason.length < MIN_REASON) continue;
    rows.push({ table: table.toLowerCase(), mechanism, reason });
  }
  return rows;
}

function bareName(table) {
  const parts = table.toLowerCase().split('.');
  return parts[parts.length - 1] ?? '';
}

function hasOverride(overrides, table, mechanism) {
  const bare = bareName(table);
  return overrides.some((row) => row.mechanism === mechanism && bareName(row.table) === bare);
}

function hasNote(notes, table) {
  const bare = bareName(table);
  if (notes.has(table.toLowerCase())) return true;
  for (const key of notes.keys()) {
    if (bareName(key) === bare) return true;
  }
  return false;
}

/**
 * @param {string} addonDir
 */
export function auditReuseCore(addonDir) {
  const root = path.resolve(addonDir);
  const issues = [];
  const banned = [];
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg && typeof pkg === 'object') {
    for (const name of dependencyNames(pkg)) {
      const category = BANNED.get(name);
      if (!category) continue;
      banned.push({ name, category });
      issues.push(kadkIssue('KADK-221', { name, category }));
    }
  }

  const manifest = readJson(path.join(root, 'manifest.json'));
  const tables = [...new Set([...ownedTables(manifest), ...sqlTables(root)])];
  const overrides = reuseOverrides(root);
  const notes = tableNotes(manifest);
  const privateTables = [];
  const ownedWithoutNote = [];

  for (const table of tables) {
    const mechanism = mechanismOf(table);
    if (mechanism) {
      const explained = hasOverride(overrides, table, mechanism);
      privateTables.push({ table, mechanism, override: explained });
      issues.push(
        explained
          ? kadkIssue('KADK-311', { table, mechanism })
          : kadkIssue('KADK-310', { table, mechanism })
      );
      continue;
    }
    if (!hasNote(notes, table)) {
      ownedWithoutNote.push(table);
      issues.push(kadkIssue('KADK-312', { table }));
    }
  }

  const report = {
    banned,
    privateTables,
    ownedWithoutNote,
  };
  const ok = issues.every((issue) => issue.severity !== 'error');
  return { ok, issues, report };
}

export function writeReuseCoreEvidence(addonDir, report) {
  const dir = path.join(path.resolve(addonDir), '.kassis', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reuse-core.json'), `${JSON.stringify(report, null, 2)}\n`);
}
