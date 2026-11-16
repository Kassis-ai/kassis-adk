import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatGuardrailCheck,
  getGuardrailCatalogEntry,
  listGuardrailCatalogEntries,
  requireGuardrailCatalogEntry,
} from '../../../../../packages/addon-sdk/src/guardrails/guardrailCatalog.ts';

const repo = path.resolve(import.meta.dirname, '../../../../..');

function profileKeys(file: string): string[] {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    guardrails: Array<{ key: string }>;
  };
  return doc.guardrails.map((item) => item.key);
}

describe('@kassis/addon-sdk guardrails.json (S2.45)', () => {
  it('lists catalogue rows with required fields', () => {
    const entries = listGuardrailCatalogEntries();
    expect(entries.length).toBeGreaterThanOrEqual(12);
    const traced = requireGuardrailCatalogEntry('adk.requirements-traced');
    expect(traced.group).toBe('B');
    expect(traced.level).toBe('L3');
    expect(traced.kadkCode).toBe('KADK-718');
    expect(formatGuardrailCheck(traced.check)).toBe('adk.requirements-traced');
    expect(getGuardrailCatalogEntry('adk.missing')).toBeUndefined();
  });

  it('covers signed v2 and unsigned v3 draft profile keys', () => {
    const ids = new Set(listGuardrailCatalogEntries().map((row) => row.id));
    const v2 = profileKeys(
      path.join(repo, 'tools/adk/profiles/addon-coding-agent.json')
    );
    const v3 = profileKeys(
      path.join(repo, 'tools/adk/profiles/addon-coding-agent.v3.draft.json')
    );
    for (const key of [...new Set([...v2, ...v3])]) {
      expect(ids.has(key), `catalogue missing ${key}`).toBe(true);
      expect(getGuardrailCatalogEntry(key)?.inProfile).toBe(true);
    }
    expect(v3).toContain('adk.requirements-traced');
  });
});