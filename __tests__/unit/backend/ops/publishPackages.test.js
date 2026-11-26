import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FALLBACK_PUBLISH_ORDER,
  NPM_TOKEN_HELP,
  formatSummaryTable,
  githubActionsProvenance,
  parsePublishArgs,
  resolveAuth,
  selectPackages,
} from '../../../../tools/release/publishPackagesLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('publish-packages helpers', () => {
  it('parses CLI flags', () => {
    expect(parsePublishArgs(['--dry-run', '--tag=next', '--only=@kassis/a,@kassis/b'])).toEqual({
      dryRun: true,
      only: ['@kassis/a', '@kassis/b'],
      tag: 'next',
      otp: null,
      skipPreflight: false,
    });
    expect(parsePublishArgs(['--otp=123456']).otp).toBe('123456');
    expect(() => parsePublishArgs(['--otp=abc'])).toThrow(/6–8 digit/);
  });

  it('orders workspace packages like the dependency graph', () => {
    const names = selectPackages(repoRoot, null).map((pkg) => pkg.name);
    expect(names).toEqual(FALLBACK_PUBLISH_ORDER);
    const at = (name) => names.indexOf(name);
    expect(at('@kassis/addon-sdk')).toBeLessThan(at('@kassis/addon-testkit'));
    expect(at('@kassis/adk-protocol')).toBeLessThan(at('@kassis/adk-core'));
  });

  it('requires NPM_TOKEN unless dry-run, otp, or GitHub OIDC', () => {
    const prev = { ...process.env };
    try {
      delete process.env.GITHUB_ACTIONS;
      delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
      expect(resolveAuth(true, null)).toEqual({ token: null, userconfig: null, usedOtp: false });
      expect(resolveAuth(false, '123456')).toEqual({ token: null, userconfig: null, usedOtp: true });
      expect(() => resolveAuth(false, null)).toThrow(NPM_TOKEN_HELP.split('\n')[0]);
      process.env.GITHUB_ACTIONS = 'true';
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://example.test';
      expect(resolveAuth(false, null)).toEqual({ token: null, userconfig: null, usedOtp: false });
    } finally {
      process.env.GITHUB_ACTIONS = prev.GITHUB_ACTIONS;
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = prev.ACTIONS_ID_TOKEN_REQUEST_URL;
    }
  });

  it('formats a summary table', () => {
    const table = formatSummaryTable([
      { name: '@kassis/adk-protocol', status: 'skipped', detail: '0.2.0' },
    ]);
    expect(table).toContain('@kassis/adk-protocol');
    expect(table).toContain('skipped');
  });

  it('detects GitHub Actions OIDC for provenance', () => {
    const prev = { ...process.env };
    try {
      delete process.env.GITHUB_ACTIONS;
      expect(githubActionsProvenance()).toBe(false);
      process.env.GITHUB_ACTIONS = 'true';
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://example.test';
      expect(githubActionsProvenance()).toBe(true);
    } finally {
      process.env.GITHUB_ACTIONS = prev.GITHUB_ACTIONS;
      process.env.ACTIONS_ID_TOKEN_REQUEST_URL = prev.ACTIONS_ID_TOKEN_REQUEST_URL;
    }
  });

  it('documents the manual publish workflow', () => {
    const doc = fs.readFileSync(path.join(repoRoot, 'docs/publishing.md'), 'utf8');
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/publish.yml'), 'utf8');
    expect(doc).toContain('Bypass two-factor authentication');
    expect(doc).toContain('publish:packages:dry');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/push:/);
  });
});