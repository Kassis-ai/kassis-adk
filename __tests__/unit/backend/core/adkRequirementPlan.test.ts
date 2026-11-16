import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  auditRequirementPlan,
  writeRequirementMapping,
} from '../../../../tools/adk/requirementPlan.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const template = path.join(repo, 'templates/kassis-addon');

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

describe('kassis-addon plan (S2.48)', () => {
  it('maps every template requirement row', () => {
    const result = auditRequirementPlan(template);
    expect(result.ok).toBe(true);
    expect(result.mapping?.unmapped).toEqual([]);
    expect(result.mapping?.requirementIds).toContain('FR-01');
    expect(result.mapping?.requirementIds).toContain('FR-98');
    const split = result.mapping?.split as Record<string, number>;
    const mapped =
      split.configuration +
      split['extension-point'] +
      split.facade +
      split['own-code'] +
      split.gap;
    expect(mapped).toBe(result.mapping?.requirementIds.length);
  });

  it('fails KADK-720 when PLAN.md is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-plan-missing-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'REQUIREMENTS.md'),
        '| ID | Pri | Requirement |\n| --- | --- | --- |\n| FR-01 | M | demo |\n'
      );
      const result = auditRequirementPlan(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-720']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-721 when a requirement has no rung', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-plan-unmap-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'REQUIREMENTS.md'),
        '| ID | Pri | Requirement |\n| --- | --- | --- |\n| FR-01 | M | demo |\n| NFR-02 | S | later |\n'
      );
      fs.writeFileSync(path.join(dir, 'PLAN.md'), '| ID | Rung | Note |\n| FR-01 | facade | ctx |\n');
      const result = auditRequirementPlan(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-721']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-722 for a rung outside the five choices', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-plan-rung-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'REQUIREMENTS.md'),
        '| ID | Pri | Requirement |\n| --- | --- | --- |\n| FR-01 | M | demo |\n'
      );
      fs.writeFileSync(path.join(dir, 'PLAN.md'), '| FR-01 | private-copy | no |\n');
      const result = auditRequirementPlan(dir);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-722', 'KADK-721']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes requirement-mapping.json under .kassis/evidence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-plan-write-'));
    try {
      const result = auditRequirementPlan(template);
      writeRequirementMapping(dir, result.mapping);
      const file = path.join(dir, '.kassis', 'evidence', 'requirement-mapping.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number };
      expect(parsed.version).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI plan exits 0 for the template', () => {
    const out = runCli(['plan', '--json'], template);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    const body = JSON.parse(out.stdout) as { ok: boolean; data: { unmapped: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.unmapped).toEqual([]);
  });

  it('certify fails with KADK-720 when PLAN.md is removed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-certify-plan-'));
    try {
      runCli(['init', '--id=sample-plan', `--dir=${dir}`], repo);
      fs.rmSync(path.join(dir, 'PLAN.md'));
      runCli(['sync', '--profile=addon-coding-agent'], dir);
      runCli(['attest'], dir);
      const lock = JSON.parse(
        fs.readFileSync(path.join(dir, '.kassis/agent-profile.lock.json'), 'utf8')
      ) as { version: string; hash: string; guardrails: Array<{ key: string }> };
      const answers = lock.guardrails.map((item) => ({
        key: item.key,
        outcome: 'followed',
        note: 'test',
        evidence: null,
      }));
      fs.writeFileSync(
        path.join(dir, '.kassis/attestation.json'),
        `${JSON.stringify({ version: lock.version, lockHash: lock.hash, runId: 'plan', answers }, null, 2)}\n`
      );
      const certified = runCli(['certify', '--json'], dir);
      const body = JSON.parse(certified.stdout) as { issues: Array<{ code: string }> };
      expect(body.issues.map((issue) => issue.code)).toContain('KADK-720');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
