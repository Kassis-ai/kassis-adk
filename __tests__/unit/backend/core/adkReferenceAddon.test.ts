import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { auditRequirementPlan } from '../../../../tools/adk/requirementPlan.mjs';
import { auditRequirementsTracing } from '../../../../tools/adk/requirementsTrace.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const fixture = path.join(repo, '__tests__', 'fixtures', 'acme-swift-approval');

describe('acme-swift-approval reference addon (S2.43)', () => {
  it('is the tier 2 acme fixture and names the platform gaps', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'manifest.json'), 'utf8')) as {
      id: string;
      publisher: string;
      tier: number;
    };
    expect(manifest.id).toBe('acme-swift-approval');
    expect(manifest.publisher).toBe('acme');
    expect(manifest.tier).toBe(2);
    const gaps = fs.readFileSync(path.join(fixture, 'GAPS.md'), 'utf8');
    expect(gaps).toContain('FR-57');
    expect(gaps).toContain('FR-60');
    expect(fs.existsSync(path.join(fixture, 'server', 'core'))).toBe(false);
  });

  it('traces every Must requirement and maps every requirement row', () => {
    const tracing = auditRequirementsTracing(fixture);
    expect(tracing.ok).toBe(true);
    expect(tracing.coverage?.untraced).toEqual([]);
    const planned = auditRequirementPlan(fixture);
    expect(planned.ok).toBe(true);
    expect(planned.mapping?.unmapped).toEqual([]);
  });

  it('check-fixture exits 0', () => {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts', 'adk-reference-build.mjs'), '--check-fixture'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('fixture ok');
  });
});
