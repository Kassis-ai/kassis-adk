/**
 * Pass/fail gate for `kassis addon certify`.
 * Missing files, a lock mismatch, and blocking guardrail answers fail with KADK-7xx.
 * Advisory answers are warnings and do not fail certification.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoCatalog = path.resolve(here, '../../packages/addon-sdk/codes/kadk-codes.json');
const catalog = require(fs.existsSync(repoCatalog) ? repoCatalog : path.join(here, 'kadk-codes.json'));

const byCode = new Map(catalog.codes.map((entry) => [entry.code, entry]));

function fill(template, values) {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (_match, name) =>
    values[name] === undefined ? `{${name}}` : String(values[name])
  );
}

export function kadkIssue(code, values = {}) {
  const entry = byCode.get(code);
  if (!entry) throw new Error(`Unknown KADK code ${code}`);
  return {
    code,
    severity: entry.severity,
    message: fill(entry.message, values),
    fix: fill(entry.fix, values),
  };
}

function answerIssues(guardrail, answer) {
  const key = guardrail.key;
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
  if (guardrail.verification === 'machine') {
    const evidence = answer.evidence;
    const hasEvidence =
      evidence &&
      typeof evidence === 'object' &&
      Object.keys(evidence).length > 0 &&
      (!guardrail.checkId || evidence.checkId === guardrail.checkId);
    if (!hasEvidence) {
      return [kadkIssue('KADK-707', { key, check: guardrail.checkId ?? 'the named check' })];
    }
  }
  return [];
}

/**
 * @param {{ lock: object | null, attestation: object | null }} input
 */
export function certifyAttestation(input) {
  const issues = [];
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
    issues.push(...answerIssues(guardrail, answer));
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
