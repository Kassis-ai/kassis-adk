import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  auditEngineeringPractice,
  writeEngineeringPracticeEvidence,
} from '../../../../tools/adk/engineeringPractice.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const template = path.join(repo, 'templates/kassis-addon');

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

function writeServer(dir: string, relative: string, contents: string): void {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

describe('kassis-addon engineering (S2.49 group E)', () => {
  it('passes the template', () => {
    const result = auditEngineeringPractice(template);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails KADK-724 when fetch has no timeout', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-timeout-'));
    try {
      writeServer(dir, 'src/server/client.ts', 'export async function load(url: string) {\n  return fetch(url);\n}\n');
      const result = auditEngineeringPractice(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-724');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-725 when findMany has no take or skip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-page-'));
    try {
      writeServer(
        dir,
        'src/server/list.ts',
        'export async function list(db: { findMany: (args: object) => Promise<object[]> }) {\n  return db.findMany({ where: { active: true } });\n}\n'
      );
      const result = auditEngineeringPractice(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-725');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-726 when JSX chrome is hardcoded or i18next is imported', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-i18n-'));
    try {
      writeServer(
        dir,
        'src/ui/pages/Demo.tsx',
        "import i18next from 'i18next';\nexport function Demo() {\n  return <button>Save draft</button>;\n}\n"
      );
      const result = auditEngineeringPractice(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-726');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-727 for a mutating job handler without idempotency', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-idem-'));
    try {
      writeServer(
        dir,
        'src/server/jobs/refresh.ts',
        'export async function handle(ctx: { data: { create: (row: object) => Promise<void> } }) {\n  await ctx.data.create({ id: 1 });\n}\n'
      );
      const result = auditEngineeringPractice(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-727');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-728 for module-level let state', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-state-'));
    try {
      writeServer(dir, 'src/server/cache.ts', 'let cache = new Map();\nexport function get() {\n  return cache;\n}\n');
      const result = auditEngineeringPractice(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-728');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes engineering-practice.json under .kassis/evidence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-eng-write-'));
    try {
      const result = auditEngineeringPractice(template);
      writeEngineeringPracticeEvidence(dir, result.evidence);
      const file = path.join(dir, '.kassis', 'evidence', 'engineering-practice.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number };
      expect(parsed.version).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI engineering exits 0 for the template', () => {
    const out = runCli(['engineering', '--json'], template);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    const body = JSON.parse(out.stdout) as { ok: boolean; data: { failedChecks: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.failedChecks).toEqual([]);
  });
});
