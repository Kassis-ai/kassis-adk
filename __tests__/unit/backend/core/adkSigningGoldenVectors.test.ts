// @vitest-environment node
/**
 * Golden vectors for addon manifest signing (S3.01). Any drift in
 * canonical JSON, content hash, UI hash, or Ed25519 verification must fail here
 * before @kassis/adk-protocol moves code out of server/core/addon-deployment.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  computeAddonContentHash,
  computeUiContentHash,
} from '../../../../server/core/addon-deployment/addonContentHash.mjs';
import { buildCanonicalManifestString } from '../../../../server/core/addon-deployment/canonicalJson.mjs';
const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const fixtureRoot = path.join(repoRoot, '__tests__/fixtures/adk-signing-golden');
const vectors = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, 'vectors.json'), 'utf8')
) as GoldenVectors;

type VectorEntry = {
  canonicalSha256: string;
  contentHash: string;
  uiContentHash: string | null;
  signature: string;
  signatureValid?: boolean;
  canonicalString?: string;
  addonDir?: string;
};

type GoldenVectors = {
  schemaVersion: number;
  testFixtureSigning: { publicKeySpkiDerHex: string; keyIdSha256: string };
  synthetic: Record<string, VectorEntry>;
  canonicalEdge: { canonicalSha256: string; canonicalString: string };
  firstPartyAddons: Record<string, VectorEntry>;
};

function canonicalSha256(manifest: Record<string, unknown>): string {
  const canonical = buildCanonicalManifestString(manifest);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function ed25519Verify(
  manifest: Record<string, unknown>,
  publicKeySpkiDerHex: string
): boolean {
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeySpkiDerHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
  const signature = manifest.signature;
  if (typeof signature !== 'string') return false;
  return crypto.verify(
    null,
    Buffer.from(buildCanonicalManifestString(manifest), 'utf8'),
    publicKey,
    Buffer.from(signature, 'hex')
  );
}

function loadManifest(relativePath: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8')
  ) as Record<string, unknown>;
}

describe('adk signing golden vectors (S3.01)', () => {
  it('canonical edge manifest matches committed string and hash', () => {
    const manifest = loadManifest('canonical-edge/manifest-without-signature.json');
    const canonical = buildCanonicalManifestString(manifest);
    expect(canonical).toBe(vectors.canonicalEdge.canonicalString);
    expect(canonicalSha256(manifest)).toBe(vectors.canonicalEdge.canonicalSha256);
  });

  it.each(Object.entries(vectors.synthetic))('%s synthetic fixture stays byte-identical', async (id, golden) => {
    expect(golden.addonDir).toBeDefined();
    const addonDir = path.join(fixtureRoot, golden.addonDir as string);
    const manifest = loadManifest(path.join(golden.addonDir as string, 'manifest.json'));

    expect(canonicalSha256(manifest)).toBe(golden.canonicalSha256);
    expect(buildCanonicalManifestString(manifest)).toBe(golden.canonicalString);
    expect(await computeAddonContentHash(addonDir)).toBe(golden.contentHash);
    expect(await computeUiContentHash(addonDir)).toBe(golden.uiContentHash);
    expect(manifest.signature).toBe(golden.signature);

    const testPublicKeyHex = vectors.testFixtureSigning.publicKeySpkiDerHex;
    expect(ed25519Verify(manifest, testPublicKeyHex)).toBe(true);
    const signing = manifest.signing as { keyId?: string } | undefined;
    expect(signing?.keyId).toBe(vectors.testFixtureSigning.keyIdSha256);
  });

  it.each(Object.entries(vectors.firstPartyAddons))(
    '%s first-party addon matches golden hashes and signature',
    async (addonId, golden) => {
      const addonDir = path.join(repoRoot, 'addons', addonId);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(addonDir, 'manifest.json'), 'utf8')
      ) as Record<string, unknown>;

      expect(canonicalSha256(manifest)).toBe(golden.canonicalSha256);
      expect(await computeAddonContentHash(addonDir)).toBe(golden.contentHash);
      expect(await computeUiContentHash(addonDir)).toBe(golden.uiContentHash);
      expect(manifest.signature).toBe(golden.signature);

      const kassisPublicKeyHex = fs
        .readFileSync(path.join(repoRoot, 'server/keys/addon_verification_public.key'), 'utf8')
        .trim();
      const signatureValid = ed25519Verify(manifest, kassisPublicKeyHex);
      expect(signatureValid).toBe(golden.signatureValid);
    }
  );

  it('fixture schema version is pinned', () => {
    expect(vectors.schemaVersion).toBe(1);
    expect(Object.keys(vectors.firstPartyAddons)).toHaveLength(9);
  });
});