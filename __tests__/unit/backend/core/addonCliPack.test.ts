// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAddonContentHash } from '../../../../server/core/addon-deployment/addonContentHash.mjs';
import { signManifestFile } from '../../../../tools/adk/signManifest.mjs';

describe('addon cli package', () => {
  it('does not pack a private signing key', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: 'packages/addon-cli',
      encoding: 'utf8',
      shell: true,
    });
    expect(result.status).toBe(0);
    const start = result.stdout.indexOf('[');
    const files = JSON.parse(result.stdout.slice(start))[0].files as Array<{ path: string }>;
    const leaked = files.filter((file) => /private/i.test(file.path));
    expect(leaked).toEqual([]);
  });

  it('writes the content hash the host checks before it signs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'addon-sign-'));
    try {
      await writeFile(path.join(dir, 'marker.txt'), 'marker\n');
      await writeFile(
        path.join(dir, 'manifest.json'),
        `${JSON.stringify({ id: 'scratch-sign', version: '1.0.0' }, null, 2)}\n`
      );
      const { privateKey } = generateKeyPairSync('ed25519');
      const exported = privateKey.export({ format: 'der', type: 'pkcs8' });
      const keyPath = path.join(dir, 'publisher.hex');
      await writeFile(keyPath, Buffer.from(exported).toString('hex'));
      await signManifestFile(path.join(dir, 'manifest.json'), keyPath);
      const signed = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as {
        contentHash: string;
        signature: string;
      };
      expect(signed.contentHash).toBe(await computeAddonContentHash(dir));
      expect(signed.signature).toMatch(/^[0-9a-f]+$/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
