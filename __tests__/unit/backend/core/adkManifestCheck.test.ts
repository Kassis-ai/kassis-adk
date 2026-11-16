import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateManifestV2 } from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';
import { checkManifestDirectory } from '../../../../packages/adk-core/src/manifestCheck.ts';
import { validManifest } from '../contracts/addonSdk/fixtures/manifestV2.fixture.js';

function codesIn(dir: string): string[] {
  return checkManifestDirectory(dir).map((issue) => issue.code);
}

function writeManifest(dir: string, manifest: unknown): void {
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('checkManifestDirectory', () => {
  it('accepts a valid manifest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-manifest-check-'));
    try {
      writeManifest(dir, validManifest);
      expect(codesIn(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports the same KADK codes as validateManifestV2 for schema and rule failures', () => {
    const manifest = {
      ...structuredClone(validManifest),
      permissions: [{ name: 'other.view', displayName: 'Other' }],
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-manifest-check-'));
    try {
      writeManifest(dir, manifest);
      const expected = validateManifestV2(manifest).issues.map((issue) => issue.code);
      expect(codesIn(dir)).toEqual(expected);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports KADK-504 when ui.entryFile includes a slash', () => {
    const manifest = {
      ...structuredClone(validManifest),
      ui: { ...(validManifest.ui as object), entryFile: 'frontend/dist/index.js' },
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-manifest-check-'));
    try {
      writeManifest(dir, manifest);
      expect(codesIn(dir)).toContain('KADK-504');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports KADK-102 when manifest.json is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-manifest-check-'));
    try {
      expect(codesIn(dir)).toEqual(['KADK-102']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});