/**
 * Pass/fail gate for `kassis addon certify`.
 * Missing files, a lock mismatch, and blocking guardrail answers fail with KADK-7xx.
 * Advisory answers are warnings and do not fail certification.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordMachineChecks } from './certifyChecks.mjs';
import { getGuardrailCatalogEntry } from './guardrailCatalog.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const besideCatalog = path.join(here, 'kadk-codes.json');
const repoCatalog =
  globalThis.__KASSIS_ADK_PACKED__ === true
    ? ''
    : path.resolve(here, '../../packages/addon-sdk/codes/kadk-codes.json');
const catalog = require(fs.existsSync(repoCatalog) ? repoCatalog : besideCatalog);

const byCode = new Map(catalog.codes.map((entry) => [entry.code, entry]));

function fill(template, values) {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (_match, name) =>
    values[name] === undefined ? `{${name}}` : String(values[name])
  );
}

export function kadkIssue(code, values = {}) {
  const entry = byCode.get(code);
  if (!entry) throw new Error(`Unknown KADK code ${code}`);
  const issue = {
    code,
    severity: entry.severity,
    message: fill(entry.message, values),
    fix: fill(entry.fix, values),
  };
  const key = typeof values.key === 'string' ? values.key : '';
  if (key.length > 0) {
    const guardrail = getGuardrailCatalogEntry(key);
    if (guardrail && guardrail.kadkCode === code && typeof guardrail.fixHint === 'string') {
      return { ...issue, fix: guardrail.fixHint };
    }
  }
  return issue;
}

const ALLOWED_OUTCOMES = new Set(['followed', 'violated', 'not_applicable']);

function outcomeLabel(outcome) {
  if (outcome === null || outcome === undefined) return 'null';
  if (outcome === '') return '(blank)';
  return String(outcome);
}

function requiredCheckIds(guardrail) {
  if (Array.isArray(guardrail.checkIds)) {
    const ids = guardrail.checkIds.filter((id) => typeof id === 'string' && id.length > 0);
    if (ids.length > 0) return ids;
  }
  if (typeof guardrail.checkId === 'string' && guardrail.checkId.length > 0)
    return [guardrail.checkId];
  return [];
}

function typedEvidence(answer) {
  const evidence = answer.evidence;
  return (
    Boolean(evidence) &&
    typeof evidence === 'object' &&
    !Array.isArray(evidence) &&
    Object.keys(evidence).length > 0
  );
}

function checkPassed(checks, id) {
  const rows = checks && Array.isArray(checks.checks) ? checks.checks : [];
  return rows.some((row) => row && row.id === id && row.exitCode === 0);
}

function machineEvidenceIssues(guardrail, answer, checks) {
  const key = guardrail.key;
  const check = requiredCheckIds(guardrail).join(', ') || 'the named check';
  const issues = [];
  if (typedEvidence(answer)) issues.push(kadkIssue('KADK-715', { key, check }));
  const ids = requiredCheckIds(guardrail);
  const passed = ids.length > 0 && ids.every((id) => checkPassed(checks, id));
  if (!passed) issues.push(kadkIssue('KADK-707', { key, check }));
  return issues;
}

function answerIssues(guardrail, answer, checks) {
  const key = guardrail.key;
  if (!ALLOWED_OUTCOMES.has(answer.outcome)) {
    return [kadkIssue('KADK-714', { key, outcome: outcomeLabel(answer.outcome) })];
  }
  if (answer.outcome === 'not_applicable') {
    return answer.note ? [] : [kadkIssue('KADK-705', { key })];
  }
  if (answer.outcome === 'violated') {
    const issues = [];
    if (!answer.note) issues.push(kadkIssue('KADK-706', { key }));
    issues.push(
      guardrail.severity === 'blocking'
        ? kadkIssue('KADK-703', { key })
        : kadkIssue('KADK-712', { key })
    );
    return issues;
  }
  if (guardrail.verification === 'machine') return machineEvidenceIssues(guardrail, answer, checks);
  return [];
}

function readChecksFile(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checksFor(input) {
  if (input.checks !== undefined) return input.checks;
  if (typeof input.addonDir === 'string' && input.addonDir.length > 0) {
    return readChecksFile(path.join(input.addonDir, '.kassis', 'evidence', 'checks.json'));
  }
  if (process.argv[2] !== 'certify') return null;
  const addonDir = process.cwd();
  if (!fs.existsSync(path.join(addonDir, 'manifest.json'))) return null;
  try {
    return recordMachineChecks(addonDir);
  } catch {
    return null;
  }
}

/**
 * @param {{ lock: object | null, attestation: object | null, checks?: object | null, addonDir?: string }} input
 */
export function certifyAttestation(input) {
  const issues = [];
  const checks = checksFor(input);
  if (!input.lock) issues.push(kadkIssue('KADK-709'));
  if (!input.attestation) issues.push(kadkIssue('KADK-701'));
  if (!input.lock || !input.attestation) {
    return { ok: false, issues };
  }

  const lock = input.lock;
  const attestation = input.attestation;
  if (attestation.version !== lock.version || attestation.lockHash !== lock.hash) {
    issues.push(
      kadkIssue('KADK-704', {
        attested: String(attestation.version ?? ''),
        locked: String(lock.version ?? ''),
      })
    );
  }
  if (attestation.expired === true) {
    issues.push(kadkIssue('KADK-708', { runId: String(attestation.runId ?? '') }));
  }

  const guardrails = Array.isArray(lock.guardrails) ? lock.guardrails : [];
  const answers = Array.isArray(attestation.answers) ? attestation.answers : [];
  const byKey = new Map(guardrails.map((item) => [item.key, item]));
  const seen = new Set();

  for (const answer of answers) {
    const guardrail = byKey.get(answer.key);
    if (!guardrail) {
      issues.push(kadkIssue('KADK-710', { key: String(answer.key) }));
      continue;
    }
    if (seen.has(answer.key)) {
      issues.push(kadkIssue('KADK-711', { key: answer.key }));
      continue;
    }
    seen.add(answer.key);
    issues.push(...answerIssues(guardrail, answer, checks));
  }

  for (const guardrail of guardrails) {
    if (seen.has(guardrail.key)) continue;
    issues.push(
      guardrail.severity === 'blocking'
        ? kadkIssue('KADK-702', { key: guardrail.key })
        : kadkIssue('KADK-713', { key: guardrail.key })
    );
  }

  return { ok: !issues.some((issue) => issue.severity === 'error'), issues };
}
