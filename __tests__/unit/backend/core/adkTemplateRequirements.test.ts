import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../../..');
const template = path.join(repo, 'templates/kassis-addon');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');

const SCAFFOLD_KINDS = [
  'addon',
  'route',
  'capability',
  'event',
  'job',
  'migration',
  'ui-slot',
] as const;

function runInit(dir: string): void {
  const result = spawnSync(
    process.execPath,
    [cli, 'init', '--id=sample-tprm-check', '--publisher=kassis', `--dir=${dir}`],
    { cwd: repo, encoding: 'utf8' }
  );
  expect(result.status, result.stderr).toBe(0);
}

describe('template BRD workflow files (S1.19)', () => {
  it('ships REQUIREMENTS.md, GAPS.md and TEST-REPORT.md in the template', () => {
    for (const name of ['REQUIREMENTS.md', 'GAPS.md', 'TEST-REPORT.md']) {
      expect(fs.existsSync(path.join(template, name)), name).toBe(true);
    }
  });

  it('REQUIREMENTS.md matches the BRD shape (front matter, ids, scaffold examples)', () => {
    const text = fs.readFileSync(path.join(template, 'REQUIREMENTS.md'), 'utf8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toMatch(/kassisRequirements:/);
    expect(text).toMatch(/acceptanceCriteria:/);
    expect(text).toMatch(/\| FR-\d+ \| [MSC]/);
    expect(text).toMatch(/\| NFR-\d+ \| [MSC]/);
    for (const kind of SCAFFOLD_KINDS) {
      expect(text, `missing scaffold example for ${kind}`).toMatch(
        new RegExp(`### Scaffold kind \`${kind}\``)
      );
    }
  });

  it('GAPS.md documents the gap entry format', () => {
    const text = fs.readFileSync(path.join(template, 'GAPS.md'), 'utf8');
    expect(text).toMatch(/^# Gaps/m);
    expect(text).toMatch(/## GAP-/);
    expect(text).toContain('Needed from the platform');
  });

  it('TEST-REPORT.md has prerequisite and acceptance sections', () => {
    const text = fs.readFileSync(path.join(template, 'TEST-REPORT.md'), 'utf8');
    expect(text).toMatch(/^# Test report/m);
    expect(text).toMatch(/## Platform prerequisites/);
    expect(text).toMatch(/## Acceptance tests/);
    expect(text).toMatch(/\| P\d /);
    expect(text).toMatch(/\| AT-/);
  });

  it('kassis-addon init copies the workflow files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-req-files-'));
    try {
      runInit(dir);
      for (const name of ['REQUIREMENTS.md', 'GAPS.md', 'TEST-REPORT.md']) {
        expect(fs.existsSync(path.join(dir, name)), name).toBe(true);
      }
      const requirements = fs.readFileSync(path.join(dir, 'REQUIREMENTS.md'), 'utf8');
      expect(requirements).toContain('sample-tprm-check');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});