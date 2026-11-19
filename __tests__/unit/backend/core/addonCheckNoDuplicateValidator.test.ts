import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../../..');
const addonCheckPath = path.join(repo, 'tools/adk/addonCheck.mjs');

describe('addonCheck.mjs (S1.06: no third manifest validator)', () => {
  it('does not compile its own Ajv schema check', () => {
    const source = fs.readFileSync(addonCheckPath, 'utf8');
    expect(source).not.toMatch(/strict:\s*false/);
    expect(source).not.toMatch(/loadAjv/);
    expect(source).not.toMatch(/export async function checkManifest/);
    expect(source).not.toMatch(/\bnew Ajv\b/);
  });

  it('still exports conformanceIssues for import and migration checks', async () => {
    const mod = await import('../../../../tools/adk/addonCheck.mjs');
    expect(mod).not.toHaveProperty('checkManifest');
    expect(typeof mod.conformanceIssues).toBe('function');
  });
});