import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  SOFT_BUDGETS,
  auditThinAddonBudgets,
  writeThinAddonBudgetsEvidence,
} from '../../../../tools/adk/thinAddonBudgets.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const template = path.join(repo, 'templates/kassis-addon');

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
}

describe('kassis-addon budgets (S2.49 group D)', () => {
  it('passes the template under soft limits', () => {
    const result = auditThinAddonBudgets(template);
    expect(result.ok).toBe(true);
    expect(result.evidence.overages).toEqual([]);
    expect(result.evidence.counts.ownedTables).toBeLessThanOrEqual(SOFT_BUDGETS.ownedTables);
    expect(result.evidence.counts.dependencies).toBeLessThanOrEqual(SOFT_BUDGETS.dependencies);
  });

  it('fails KADK-723 when over ownedTables without a BUDGETS.md reason', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-budgets-fail-'));
    try {
      const owned = Array.from({ length: SOFT_BUDGETS.ownedTables + 1 }, (_, index) => `t_${index}`);
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          manifestVersion: 2,
          id: 'sample-budgets',
          database: { ownedTables: owned },
        })
      );
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
      fs.mkdirSync(path.join(dir, 'src', 'server'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'server', 'index.ts'), 'export {}\n');
      const result = auditThinAddonBudgets(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-723']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when BUDGETS.md records a reason for the overage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-budgets-reason-'));
    try {
      const owned = Array.from({ length: SOFT_BUDGETS.ownedTables + 2 }, (_, index) => `t_${index}`);
      fs.writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({
          manifestVersion: 2,
          id: 'sample-budgets-ok',
          database: { ownedTables: owned },
        })
      );
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: {} }));
      fs.mkdirSync(path.join(dir, 'src', 'server'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'server', 'index.ts'), 'export {}\n');
      fs.writeFileSync(
        path.join(dir, 'BUDGETS.md'),
        [
          '| Metric | Count | Limit | Reason |',
          '| --- | ---: | ---: | --- |',
          `| ownedTables | ${owned.length} | ${SOFT_BUDGETS.ownedTables} | Distinct stage tables for underwriting |`,
          '',
        ].join('\n')
      );
      const result = auditThinAddonBudgets(dir);
      expect(result.ok).toBe(true);
      expect(result.evidence.overages).toHaveLength(1);
      expect(result.evidence.overages[0].reason).toContain('underwriting');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes thin-addon-budgets.json under .kassis/evidence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-budgets-write-'));
    try {
      const result = auditThinAddonBudgets(template);
      writeThinAddonBudgetsEvidence(dir, result.evidence);
      const file = path.join(dir, '.kassis', 'evidence', 'thin-addon-budgets.json');
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number };
      expect(parsed.version).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('CLI budgets exits 0 for the template', () => {
    const out = runCli(['budgets', '--json'], template);
    expect(out.stderr).toBe('');
    expect(out.status).toBe(0);
    const body = JSON.parse(out.stdout) as { ok: boolean; data: { overageCount: number } };
    expect(body.ok).toBe(true);
    expect(body.data.overageCount).toBe(0);
  });
});
