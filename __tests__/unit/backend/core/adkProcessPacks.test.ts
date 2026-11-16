import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditProcessPacks } from '../../../../tools/adk/processPacks.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const fixtures = path.join(repo, '__tests__/fixtures/adk-process-packs');
const template = path.join(repo, 'templates/kassis-addon');

function codes(dir: string): string[] {
  return auditProcessPacks(dir).issues.map((issue) => issue.code);
}

const PROVENANCE_TABLES = [
  'case_templates',
  'flow_templates',
  'dashboard_templates',
  'data_flow_templates',
  'qa_rules',
  'questionnaire_templates',
  'list_templates',
  'entity_templates',
  'policy_rules',
  'flag_rules',
  'compliance_rules',
  'email_templates',
  'prompt_templates',
  'lifecycle_policies',
];

describe('process pack format (S2.52)', () => {
  it('records every provenance table and ships no invented body schema', () => {
    const catalog = JSON.parse(
      fs.readFileSync(path.join(repo, 'packages/addon-sdk/process-pack-kinds.json'), 'utf8')
    ) as { kinds: Array<{ id: string; table: string; schema: string | null; reason: string }> };
    expect(catalog.kinds.map((kind) => kind.table).sort()).toEqual([...PROVENANCE_TABLES].sort());
    for (const kind of catalog.kinds) {
      expect(kind.schema, kind.id).toBeNull();
      expect(kind.reason.length, kind.id).toBeGreaterThan(20);
    }
  });

  it('accepts namespaced keys whose references resolve and warns that the body is unchecked', () => {
    const result = auditProcessPacks(path.join(fixtures, 'pass'));
    expect(result.ok).toBe(true);
    expect(codes(path.join(fixtures, 'pass'))).toEqual(['KADK-313', 'KADK-313']);
    expect(result.issues.every((issue) => issue.severity === 'warning')).toBe(true);
  });

  it('fails KADK-125 when a pack key is outside the addon namespace', () => {
    const result = auditProcessPacks(path.join(fixtures, 'namespace-fail'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('KADK-125');
    expect(result.issues[0]?.message).toContain('other.case.application');
  });

  it('fails KADK-314 when a reference is missing or is an id', () => {
    const result = auditProcessPacks(path.join(fixtures, 'dangling-ref'));
    expect(result.ok).toBe(false);
    const messages = result.issues.filter((issue) => issue.code === 'KADK-314').map((issue) => issue.message);
    expect(messages.some((message) => message.includes('acme-underwriting.flow.missing'))).toBe(true);
    expect(messages.some((message) => message.includes('42'))).toBe(true);
  });

  it('fails when a pack names a permission or record type the manifest does not declare', () => {
    const result = auditProcessPacks(path.join(fixtures, 'undeclared'));
    expect(result.ok).toBe(false);
    expect(codes(path.join(fixtures, 'undeclared'))).toEqual(
      expect.arrayContaining(['KADK-128', 'KADK-129'])
    );
  });

  it('fails KADK-316 when the file carries settings, users or secrets', () => {
    const result = auditProcessPacks(path.join(fixtures, 'forbidden'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('KADK-316');
  });

  it('fails KADK-127 when the file key or kind differs from the manifest', () => {
    const result = auditProcessPacks(path.join(fixtures, 'mismatch'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('KADK-127');
  });

  it('fails KADK-126 when the listed file is missing', () => {
    const result = auditProcessPacks(path.join(fixtures, 'missing-file'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-126']);
  });

  it('fails KADK-318 when a process file is not listed', () => {
    const result = auditProcessPacks(path.join(fixtures, 'unlisted'));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-318']);
  });

  it('passes the template addon, which ships no process pack', () => {
    expect(auditProcessPacks(template)).toEqual({ ok: true, issues: [] });
  });
});
