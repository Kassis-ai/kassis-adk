/**
 * Soft thin-addon budgets (group D). Over a threshold needs a written reason in BUDGETS.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { kadkIssue } from './certifyAttestation.mjs';

export const SOFT_BUDGETS = {
  ownedTables: 8,
  routes: 20,
  dependencies: 10,
  serverSourceBytes: 120000,
};

const REASON_ROW =
  /^\|\s*(ownedTables|routes|dependencies|serverSourceBytes)\s*\|\s*\d+\s*\|\s*\d+\s*\|\s*(.+?)\s*\|/gim;

function walkFiles(dir, relative, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    const next = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(absolute, next, out);
    else if (entry.isFile()) out.push({ relative: next, absolute });
  }
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

function countOwnedTables(manifest) {
  const database = manifest && typeof manifest === 'object' ? manifest.database : null;
  const owned =
    database && typeof database === 'object' && Array.isArray(database.ownedTables)
      ? database.ownedTables
      : [];
  return owned.filter((name) => typeof name === 'string' && name.length > 0).length;
}

function countRoutes(addonDir) {
  const files = [];
  walkFiles(path.join(addonDir, 'src'), 'src', files);
  let count = 0;
  for (const file of files) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file.relative)) continue;
    const text = fs.readFileSync(file.absolute, 'utf8');
    const matches = text.match(/routes\.mount\s*\(/g);
    if (matches) count += matches.length;
  }
  return count;
}

function countDependencies(pkg) {
  const deps =
    pkg && typeof pkg === 'object' && pkg.dependencies && typeof pkg.dependencies === 'object'
      ? pkg.dependencies
      : {};
  return Object.keys(deps).length;
}

function serverSourceBytes(addonDir) {
  const files = [];
  const serverDir = path.join(addonDir, 'src', 'server');
  const srcDir = path.join(addonDir, 'src');
  if (fs.existsSync(serverDir)) walkFiles(serverDir, 'src/server', files);
  else walkFiles(srcDir, 'src', files);
  let total = 0;
  for (const file of files) {
    if (file.relative.includes('/ui/') || file.relative.startsWith('src/ui')) continue;
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file.relative)) continue;
    total += fs.statSync(file.absolute).size;
  }
  return total;
}

function parseReasons(text) {
  const reasons = {};
  let match = REASON_ROW.exec(text);
  while (match !== null) {
    const metric = match[1];
    const reason = match[2].trim();
    if (reason.length > 0) reasons[metric] = reason;
    match = REASON_ROW.exec(text);
  }
  REASON_ROW.lastIndex = 0;
  return reasons;
}

/**
 * @param {string} addonDir
 * @returns {{ ok: boolean, issues: import('./certifyAttestation.mjs').CatalogIssue[], evidence: object }}
 */
export function auditThinAddonBudgets(addonDir) {
  const root = path.resolve(addonDir);
  const manifest = readJson(path.join(root, 'manifest.json')) ?? {};
  const pkg = readJson(path.join(root, 'package.json')) ?? {};
  const counts = {
    ownedTables: countOwnedTables(manifest),
    routes: countRoutes(root),
    dependencies: countDependencies(pkg),
    serverSourceBytes: serverSourceBytes(root),
  };
  const budgetsPath = path.join(root, 'BUDGETS.md');
  const reasons = fs.existsSync(budgetsPath)
    ? parseReasons(fs.readFileSync(budgetsPath, 'utf8'))
    : {};
  const overages = [];
  const issues = [];
  for (const metric of Object.keys(SOFT_BUDGETS)) {
    const limit = SOFT_BUDGETS[metric];
    const count = counts[metric];
    if (count <= limit) continue;
    const reason = reasons[metric];
    const row = { metric, count, limit, reason: reason ?? null };
    overages.push(row);
    if (!reason) {
      issues.push(kadkIssue('KADK-723', { metric, count: String(count), limit: String(limit) }));
    }
  }
  const evidence = {
    version: 1,
    limits: { ...SOFT_BUDGETS },
    counts,
    overages,
    reasons,
    checkedAt: new Date().toISOString(),
  };
  return { ok: issues.length === 0, issues, evidence };
}

/**
 * @param {string} addonDir
 * @param {object} evidence
 */
export function writeThinAddonBudgetsEvidence(addonDir, evidence) {
  const evidenceDir = path.join(path.resolve(addonDir), '.kassis', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'thin-addon-budgets.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}
