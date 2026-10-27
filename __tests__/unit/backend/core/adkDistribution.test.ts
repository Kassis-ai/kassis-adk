import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiSurfaceReport } from '../../../../tools/adk/api-surface.mjs';
import { writeAirgapBundle } from '../../../../tools/adk/airgap-bundle.mjs';
import { buildSbom } from '../../../../tools/adk/package-sbom.mjs';

describe('ADK package distribution', () => {
  it('keeps the committed API surface in step with the SDK entry', () => {
    const index = fs.readFileSync('packages/addon-sdk/src/index.ts', 'utf8');
    const report = fs.readFileSync('packages/addon-sdk/etc/addon-sdk.api.md', 'utf8');
    expect(report).toBe(apiSurfaceReport(index));
    expect(report).toContain('AddonContext');
  });

  it('writes an SBOM and an air-gap bundle without the private key', () => {
    const sbom = buildSbom();
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components.map((item: { name: string }) => item.name)).toContain('@kassis/addon-sdk');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-'));
    try {
      writeAirgapBundle(dir);
      expect(fs.existsSync(path.join(dir, 'sbom.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'keys/addon_verification_public.key'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'templates/kassis-addon/manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'server/keys/addon_signing_private.key'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
