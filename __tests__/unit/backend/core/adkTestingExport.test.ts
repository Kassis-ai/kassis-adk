import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as testing from '@kassis/adk-core/testing';

const repo = path.resolve(import.meta.dirname, '../../../..');

describe('@kassis/adk-core/testing (host contract tests)', () => {
  it('exposes the kit internals the Kassis host tests use', () => {
    for (const name of [
      'buildAddon',
      'conformanceIssues',
      'devHostTier2Plan',
      'migrateWithRunner',
      'migrationChecksum',
      'planTransaction',
      'readBundledProfile',
      'signManifestFile',
      'splitPsqlScript',
      'verifyProfileSignature',
    ]) {
      expect(typeof (testing as Record<string, unknown>)[name], name).toBe('function');
    }
  });

  it('is published from dist, next to the main entry', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'packages/adk-core/package.json'), 'utf8'));
    expect(manifest.exports['./testing'].default).toBe('./src/testing.ts');
    expect(manifest.publishConfig.exports['./testing'].import).toBe('./dist/testing.js');
  });
});
