/**
 * Maps Must rows in REQUIREMENTS.md to test/ or GAPS.md mentions.
 * Writes `.kassis/evidence/requirements-coverage.json` for the evidence pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { kadkIssue } from './certifyAttestation.mjs';

const MUST_ROW = /^\|\s*(FR-\d+|NFR-\d+)\s*\|\s*M\s*\|/gim;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMustIds(requirementsText) {
  const ids = [];
  let match = MUST_ROW.exec(requirementsText);
  while (match !== null) {
    ids.push(match[1]);
    match = MUST_ROW.exec(requirementsText);
  }
  MUST_ROW.lastIndex = 0;
  return [...new Set(ids)];
}

function walkFiles(dir, relative, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const next = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(absolute, next, out);
    else if (entry.isFile()) out.push({ relative: next, absolute });
  }
}

function listTestFiles(addonDir) {
  const files = [];
  walkFiles(path.join(addonDir, 'test'), 'test', files);
  return files;
}

function idInText(text, id) {
  return new RegExp(`\\b${escapeRegExp(id)}\\b`).test(text);
}

function traceOneId(addonDir, id) {
  const via = [];
  for (const file of listTestFiles(addonDir)) {
    const text = fs.readFileSync(file.absolute, 'utf8');
    if (idInText(text, id)) via.push(file.relative);
  }
  const gapsPath = path.join(addonDir, 'GAPS.md');
  if (fs.existsSync(gapsPath)) {
    const gapsText = fs.readFileSync(gapsPath, 'utf8');
    if (idInText(gapsText, id)) via.push('GAPS.md');
  }
  return via;
}

/**
 * @param {string} addonDir
 * @returns {{ ok: boolean, issues: import('./certifyAttestation.mjs').CatalogIssue[], coverage: object | null }}
 */
export function auditRequirementsTracing(addonDir) {
  const root = path.resolve(addonDir);
  const reqPath = path.join(root, 'REQUIREMENTS.md');
  const issues = [];
  if (!fs.existsSync(reqPath)) {
    issues.push(kadkIssue('KADK-718'));
    return { ok: false, issues, coverage: null };
  }
  const mustIds = parseMustIds(fs.readFileSync(reqPath, 'utf8'));
  const rows = [];
  const untraced = [];
  for (const id of mustIds) {
    const via = traceOneId(root, id);
    const traced = via.length > 0;
    rows.push({ id, traced, via });
    if (!traced) {
      untraced.push(id);
      issues.push(kadkIssue('KADK-719', { id }));
    }
  }
  const coverage = {
    version: 1,
    mustIds,
    rows,
    untraced,
    tracedAt: new Date().toISOString(),
  };
  return { ok: untraced.length === 0, issues, coverage };
}

/**
 * @param {string} addonDir
 * @param {object | null} coverage
 */
export function writeRequirementsCoverage(addonDir, coverage) {
  if (!coverage) return;
  const evidenceDir = path.join(path.resolve(addonDir), '.kassis', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'requirements-coverage.json'),
    `${JSON.stringify(coverage, null, 2)}\n`
  );
}