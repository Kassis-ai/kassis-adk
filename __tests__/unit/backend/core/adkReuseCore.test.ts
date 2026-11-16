import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditReuseCore } from '../../../../tools/adk/reuseCore.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const fixtures = path.join(repo, '__tests__/fixtures/adk-guardrail-group-a');
const template = path.join(repo, 'templates/kassis-addon');

function codes(dir: string): string[] {
  return auditReuseCore(dir).issues.map((issue) => issue.code);
}

describe('guardrail group A reuse core (S2.47)', () => {
  it('passes a package.json with no banned dependency', () => {
    const result = auditReuseCore(path.join(fixtures, 'banned-pass'));
    expect(result.ok).toBe(true);
    expect(codes(path.join(fixtures, 'banned-pass'))).not.toContain('KADK-221');
  });

  it('fails KADK-221 when package.json depends on a banned mail client', () => {
    const result = auditReuseCore(path.join(fixtures, 'banned-fail'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-221']);
    expect(result.issues[0]?.message).toContain('nodemailer');
  });

  it('passes a quotes table that is not a private mechanism', () => {
    const result = auditReuseCore(path.join(fixtures, 'private-pass'));
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).not.toContain('KADK-310');
  });

  it('fails KADK-310 for a private approvals table', () => {
    const result = auditReuseCore(path.join(fixtures, 'private-fail'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('KADK-310');
  });

  it('warns KADK-311 when REUSE.md explains the private table', () => {
    const result = auditReuseCore(path.join(fixtures, 'private-override'));
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-311']);
    expect(result.issues[0]?.severity).toBe('warning');
  });

  it('passes an owned table that names the core record it could not be', () => {
    const result = auditReuseCore(path.join(fixtures, 'notes-pass'));
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).not.toContain('KADK-312');
  });

  it('warns KADK-312 when an owned table has no core alternative', () => {
    const result = auditReuseCore(path.join(fixtures, 'notes-fail'));
    expect(result.ok).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-312']);
    expect(result.issues[0]?.severity).toBe('warning');
  });

  it('passes the template addon untouched', () => {
    const result = auditReuseCore(template);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
