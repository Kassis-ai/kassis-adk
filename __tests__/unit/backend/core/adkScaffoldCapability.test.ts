import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';

function writeManifest(
  dir: string,
  manifest: Record<string, unknown>
): Record<string, unknown> {
  const body = { manifestVersion: 2, hostApi: '^1.0.0', publisher: 'acme', ...manifest };
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

describe('scaffold capability', () => {
  it('writes provides for tier 2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-cap-'));
    try {
      writeManifest(dir, { id: 'acme-widget', name: 'Widget', tier: 2, version: '0.1.0' });
      const result = scaffoldProject({
        dir,
        kind: 'capability',
        id: '',
        name: 'lookup',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(result.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.provides).toEqual([{ capability: 'acme-widget.lookup', version: '1.0.0' }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still writes provides for tier 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-cap-'));
    try {
      writeManifest(dir, { id: 'sample-tprm-check', name: 'Sample', tier: 1, version: '0.1.0' });
      const result = scaffoldProject({
        dir,
        kind: 'capability',
        id: '',
        name: 'lookup',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(result.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.provides).toEqual([
        { capability: 'sample-tprm-check.lookup', version: '1.0.0' },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});