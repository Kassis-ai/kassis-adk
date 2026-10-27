import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { apiSurfaceReport } from '../../../../tools/adk/api-surface.mjs';
import { writeAirgapBundle } from '../../../../tools/adk/airgap-bundle.mjs';
import { buildSbom } from '../../../../tools/adk/package-sbom.mjs';
import { signTarball } from '../../../../tools/adk/sign-tarball.mjs';

describe('ADK package distribution', () => {
  it('keeps the API extractor report for the SDK entry', () => {
    const report = fs.readFileSync('packages/addon-sdk/etc/addon-sdk.api.md', 'utf8');
    expect(report).toContain('AddonContext');
    const index = fs.readFileSync('packages/addon-sdk/src/index.ts', 'utf8');
    expect(apiSurfaceReport(index)).toContain('AddonContext');
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

  it('signs a packed tarball with an Ed25519 publisher key', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const privateKeyHex = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-tarball-'));
    try {
      const tarball = path.join(dir, 'addon-sdk.tgz');
      fs.writeFileSync(tarball, 'packed-bytes');
      const sigPath = signTarball(tarball, privateKeyHex);
      const ok = crypto.verify(
        null,
        fs.readFileSync(tarball),
        publicKey,
        Buffer.from(fs.readFileSync(sigPath, 'utf8').trim(), 'hex')
      );
      expect(ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
