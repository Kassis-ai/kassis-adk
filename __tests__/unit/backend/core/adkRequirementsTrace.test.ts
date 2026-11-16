import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  auditRequirementsTracing,
  writeRequirementsCoverage,
} from '../../../../tools/adk/requirementsTrace.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const template = path.join(repo, 'templates/kassis-addon');

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

describe('kassis-addon requirements (S2.39)', () => {
  it('template starter Must ids are traced in test/', () => {
    const result = auditRequirementsTracing(template);
    expect(result.ok).toBe(true);
    expect(result.coverage?.untraced).toEqual([]);
    expect(result.coverage?.mustIds.sort()).toEqual(['FR-01', 'FR-02', 'FR-03', 'NFR-01', 'NFR-02']);
  });

  it('fails KADK-719 when a Must id has no test or GAPS mention', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-req-trace-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'REQUIREMENTS.md'),
        '| ID | Pri | Requirement |\n| --- | --- | --- |\n| FR-99 | M | demo |\n'
      );
      fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'test', 'empty.test.ts'), 'export {};\n');
      const result = auditRequirementsTracing(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-719']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a GAPS.md mention', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-req-gap-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'REQUIREMENTS.md'),
        '| ID | Pri | Requirement |\n| --- | --- | --- |\n| FR-77 | M | blocked |\n'
      );
      fs.writeFileSync(path.join(dir, 'GAPS.md'), 'Requirement: FR-77\n');
      const result = auditRequirementsTracing(dir);
      expect(result.ok).toBe(true);
      expect(result.coverage?.rows[0]?.via).toContain('GAPS.md');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes requirements-coverage.json under .kassis/evidence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-req-write-'));
    try {
      const result = auditRequirementsTracing(template);
      writeRequirementsCoverage(dir, result.coverage);
      const file = path.join(dir, '.kassis', 'evidence', 'requirements-coverage.json');
      expect(fs.existsSync(file)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number };
      expect(parsed.version).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI requirements exits 0 for the template', () => {
    const out = runCli(['requirements', '--json'], template);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    const body = JSON.parse(out.stdout) as { ok: boolean; data: { untraced: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.untraced).toEqual([]);
  });

  it('certify fails with KADK-719 when Must ids are untraced', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-certify-req-'));
    try {
      runCli(['init', '--id=sample-req', `--dir=${dir}`], repo);
      const reqPath = path.join(dir, 'REQUIREMENTS.md');
      fs.writeFileSync(
        reqPath,
        `${fs.readFileSync(reqPath, 'utf8')}\n| FR-99 | M | extra must |\n`
      );
      fs.rmSync(path.join(dir, 'test', 'requirements-trace.test.ts'));
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
        `${JSON.stringify({ version: lock.version, lockHash: lock.hash, runId: 'req-trace', answers }, null, 2)}\n`
      );
      const certified = runCli(['certify', '--json'], dir);
      const body = JSON.parse(certified.stdout) as { issues: Array<{ code: string }> };
      expect(body.issues.map((issue) => issue.code)).toContain('KADK-719');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});