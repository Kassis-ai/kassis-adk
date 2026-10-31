import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { apiSurfaceReport } from '../../../../tools/adk/api-surface.mjs';
import {
  assertPopulatedAirgapBundle,
  verifyAirgapChecksums,
  writeAirgapBundle,
} from '../../../../tools/adk/airgap-bundle.mjs';
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
    expect(sbom.components.map((item: { name: string }) => item.name)).toContain(
      '@kassis/addon-sdk'
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-'));
    try {
      writeAirgapBundle(dir);
      expect(fs.existsSync(path.join(dir, 'sbom.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'keys/addon_verification_public.key'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'templates/kassis-addon/manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'packages/adk-core/src/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'tools/adk/kassis-addon.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'checksums.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'checksums.txt'), 'utf8')).toContain(
        'tools/adk/kassis-addon.mjs'
      );
      verifyAirgapChecksums(dir);
      expect(() => assertPopulatedAirgapBundle(dir)).toThrow(/not populated/);
      expect(fs.existsSync(path.join(dir, 'server/keys/addon_signing_private.key'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('copies a supplied tarball and rejects a bad checksum', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-tar-'));
    try {
      const fake = path.join(dir, 'fake.tgz');
      fs.writeFileSync(fake, 'not-a-tarball');
      const out = path.join(dir, 'bundle');
      writeAirgapBundle(out, undefined, { tarballs: [{ name: '@kassis/addon-sdk', file: fake }] });
      const index = JSON.parse(fs.readFileSync(path.join(out, 'packs/index.json'), 'utf8')) as {
        packages: Record<string, string>;
      };
      expect(index.packages['@kassis/addon-sdk']).toBe('packs/fake.tgz');
      expect(fs.readFileSync(path.join(out, 'packs/fake.tgz'), 'utf8')).toBe('not-a-tarball');
      verifyAirgapChecksums(out);
      fs.appendFileSync(path.join(out, 'tools/adk/kassis-addon.mjs'), '\n');
      expect(() => verifyAirgapChecksums(out)).toThrow(
        /checksum mismatch: tools\/adk\/kassis-addon.mjs/
      );
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
