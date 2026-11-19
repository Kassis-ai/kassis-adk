/**
 * Maps each REQUIREMENTS.md row to a lowest-rung choice in PLAN.md.
 * Writes `.kassis/evidence/requirement-mapping.json` for the evidence pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { kadkIssue } from './certifyAttestation.mjs';

const REQ_ROW = /^\|\s*(FR-\d+|NFR-\d+)\s*\|\s*[MSC]\s*\|/gim;
const PLAN_ROW = /^\|\s*(FR-\d+|NFR-\d+)\s*\|\s*([a-z-]+)\s*\|/gim;

export const PLAN_RUNGS = ['configuration', 'extension-point', 'facade', 'own-code', 'gap'];

function parseIds(text, pattern) {
  const ids = [];
  let match = pattern.exec(text);
  while (match !== null) {
    ids.push(match[1]);
    match = pattern.exec(text);
  }
  pattern.lastIndex = 0;
  return ids;
}

function parsePlanRows(text) {
  const rows = [];
  let match = PLAN_ROW.exec(text);
  while (match !== null) {
    rows.push({ id: match[1], rung: match[2] });
    match = PLAN_ROW.exec(text);
  }
  PLAN_ROW.lastIndex = 0;
  return rows;
}

function emptySplit() {
  return {
    configuration: 0,
    'extension-point': 0,
    facade: 0,
    'own-code': 0,
    gap: 0,
  };
}

/**
 * @param {string} addonDir
 * @returns {{ ok: boolean, issues: import('./certifyAttestation.mjs').CatalogIssue[], mapping: object | null }}
 */
export function auditRequirementPlan(addonDir) {
  const root = path.resolve(addonDir);
  const reqPath = path.join(root, 'REQUIREMENTS.md');
  const issues = [];
  if (!fs.existsSync(reqPath)) {
    issues.push(kadkIssue('KADK-718'));
    return { ok: false, issues, mapping: null };
  }
  const requirementIds = [...new Set(parseIds(fs.readFileSync(reqPath, 'utf8'), REQ_ROW))];
  const planPath = path.join(root, 'PLAN.md');
  if (!fs.existsSync(planPath)) {
    issues.push(kadkIssue('KADK-720'));
    return { ok: false, issues, mapping: null };
  }
  const declared = parsePlanRows(fs.readFileSync(planPath, 'utf8'));
  const byId = new Map();
  for (const row of declared) {
    if (byId.has(row.id)) {
      issues.push(kadkIssue('KADK-722', { id: row.id, rung: 'duplicate' }));
      continue;
    }
    if (!PLAN_RUNGS.includes(row.rung)) {
      issues.push(kadkIssue('KADK-722', { id: row.id, rung: row.rung }));
      continue;
    }
    byId.set(row.id, row.rung);
  }
  const rows = [];
  const unmapped = [];
  const split = emptySplit();
  for (const id of requirementIds) {
    const rung = byId.get(id);
    if (!rung) {
      unmapped.push(id);
      issues.push(kadkIssue('KADK-721', { id }));
      rows.push({ id, rung: null });
      continue;
    }
    split[rung] += 1;
    rows.push({ id, rung });
  }
  const mapping = {
    version: 1,
    requirementIds,
    rows,
    unmapped,
    split,
    plannedAt: new Date().toISOString(),
  };
  return { ok: issues.length === 0, issues, mapping };
}

/**
 * @param {string} addonDir
 * @param {object | null} mapping
 */
export function writeRequirementMapping(addonDir, mapping) {
  if (!mapping) return;
  const evidenceDir = path.join(path.resolve(addonDir), '.kassis', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'requirement-mapping.json'),
    `${JSON.stringify(mapping, null, 2)}\n`
  );
}
