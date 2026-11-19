import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  KIT_UNIT_GLOBS,
  assertGroupVersion,
  assertPublishAllowed,
  buildKitSbom,
  kitFixedGroup,
  orderPackages,
  packFilename,
  resolveKitPackages,
  verifyChecksums,
  versionFromAdkTag,
  writeChecksums,
} from '../../../../tools/release/adkKitReleaseLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('ADK kit release package list', () => {
  it('reads the single changesets fixed group and orders dependencies first', () => {
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, '.changeset/config.json'), 'utf8'));
    const names = kitFixedGroup(config);
    const packages = resolveKitPackages(repoRoot, names);
    expect(new Set(packages.map((pkg) => pkg.name))).toEqual(new Set(names));
    expect(packages.map((pkg) => pkg.name)).not.toContain('@kassis/addon-ui');
    expect(packages.map((pkg) => pkg.name)).not.toContain('@kassis/host-sdk');
    expect(packages.map((pkg) => pkg.name)).not.toContain('@kassis/agent-kit');
    expect(new Set(packages.map((pkg) => pkg.version)).size).toBe(1);
    const at = (name) => packages.findIndex((pkg) => pkg.name === name);
    expect(at('@kassis/addon-sdk')).toBeGreaterThanOrEqual(0);
    expect(at('@kassis/adk-protocol')).toBeGreaterThanOrEqual(0);
    expect(at('@kassis/addon-sdk')).toBeLessThan(at('@kassis/addon-testkit'));
    expect(at('@kassis/adk-protocol')).toBeLessThan(at('@kassis/adk-core'));
    expect(at('@kassis/addon-testkit')).toBeLessThan(at('@kassis/adk-core'));
    expect(at('@kassis/addon-testkit')).toBeLessThan(at('@kassis/addon-cli'));
  });

  it('rejects a second fixed group and a package that is not in the workspace', () => {
    expect(() => kitFixedGroup({ fixed: [['@kassis/addon-sdk'], ['@kassis/other']] })).toThrow(
      /one changesets fixed group/
    );
    expect(() => kitFixedGroup({ fixed: [[]] })).toThrow(/empty/);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-kit-'));
    fs.mkdirSync(path.join(root, 'packages', 'only'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages', 'only', 'package.json'),
      JSON.stringify({ name: '@kassis/only', version: '0.1.0' })
    );
    expect(() => resolveKitPackages(root, ['@kassis/only', '@kassis/missing'])).toThrow(
      /not found/
    );
  });

  it('orders a dependency cycle as an error and keeps an extra group member', () => {
    const row = (name, dependencies) => ({ name, version: '0.1.0', dir: name, dependencies });
    expect(() => orderPackages([row('a', ['b']), row('b', ['a'])])).toThrow(/cycle/);
    const ordered = orderPackages([
      row('@kassis/addon-sdk', []),
      row('@kassis/extra', ['@kassis/addon-sdk']),
    ]);
    expect(ordered.map((pkg) => pkg.name)).toEqual(['@kassis/addon-sdk', '@kassis/extra']);
  });
});

describe('ADK kit release tag and bundle', () => {
  it('parses adk tags and refuses a mismatched package version', () => {
    expect(versionFromAdkTag('adk/v0.1.0')).toBe('0.1.0');
    expect(versionFromAdkTag('adk/v1.2.3-rc.1')).toBe('1.2.3-rc.1');
    expect(() => versionFromAdkTag('v0.1.0')).toThrow(/not an ADK kit tag/);
    expect(() => versionFromAdkTag('adk/v1')).toThrow(/not an ADK kit tag/);
    expect(() =>
      assertGroupVersion([{ name: '@kassis/addon-sdk', version: '0.1.1' }], '0.1.0')
    ).toThrow(/0\.1\.1/);
  });

  it('writes a CycloneDX SBOM and checksums for the group', () => {
    const packages = [
      { name: '@kassis/addon-sdk', version: '0.1.0', dependencies: ['ajv'] },
      { name: '@kassis/extra', version: '0.1.0', dependencies: ['@kassis/addon-sdk'] },
    ];
    const sbom = buildKitSbom(packages, new Map([['@kassis/addon-sdk', 'ab'.repeat(32)]]));
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components.map((item) => item.name)).toEqual([
      '@kassis/addon-sdk',
      '@kassis/extra',
    ]);
    expect(sbom.components[0].hashes).toEqual([{ alg: 'SHA-256', content: 'ab'.repeat(32) }]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-checksums-'));
    try {
      fs.writeFileSync(path.join(dir, 'packs.txt'), 'tarball');
      writeChecksums(dir);
      verifyChecksums(dir);
      fs.appendFileSync(path.join(dir, 'packs.txt'), 'x');
      expect(() => verifyChecksums(dir)).toThrow(/checksum mismatch: packs.txt/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the filename from npm pack JSON and refuses a local publish', () => {
    const filename = packFilename(
      'npm notice\n[{"filename":"kassis-addon-sdk-0.1.0.tgz","bundled":[]}]\n'
    );
    expect(filename).toBe('kassis-addon-sdk-0.1.0.tgz');
    expect(() => assertPublishAllowed({})).toThrow(/ADK_KIT_PUBLISH/);
    expect(() => assertPublishAllowed({ ADK_KIT_PUBLISH: '1' })).toThrow(/NODE_AUTH_TOKEN/);
  });

  it('limits the release test run to kit unit tests', () => {
    expect(KIT_UNIT_GLOBS.length).toBeGreaterThan(0);
    for (const glob of KIT_UNIT_GLOBS) {
      expect(glob).not.toContain('integration');
      expect(glob).not.toContain('e2e');
      expect(glob.startsWith('__tests__/unit/')).toBe(true);
    }
  });
});

describe('ADK kit release workflow', () => {
  const workflowPath = path.join(repoRoot, '.github/workflows/adk-release.yml');
  const text = fs.readFileSync(workflowPath, 'utf8');
  const workflow = parse(text);
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);

  it('pins every third-party action and publishes the fixed group with provenance', () => {
    expect(workflow.on.push.tags).toEqual(['adk/v*']);
    for (const step of steps.filter((step) => step.uses && !step.uses.startsWith('./'))) {
      expect(step.uses, step.name ?? step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
    expect(text).toContain('secrets.NPM_TOKEN');
    expect(text).toContain('adk-kit-release.mjs publish');
    const publisher = fs.readFileSync(path.join(repoRoot, 'tools/release/adk-kit-release.mjs'), 'utf8');
    expect(publisher).toContain("'--provenance'");
    expect(publisher).toContain("['stage', 'publish', tarball");
    expect(text).toContain('npm install -g npm@^11.15.0');
    expect(text).not.toContain('@kassis/');
    expect(text).not.toContain('git push');
    expect(text).not.toContain('git tag');
    expect(text).not.toMatch(/npm_[A-Za-z0-9]{20,}/);
    expect(text).not.toMatch(/COSIGN_PRIVATE_KEY == ''|COSIGN_PRIVATE_KEY != ''/);
    expect(workflow.jobs.release.permissions['id-token']).toBe('write');
    expect(workflow.jobs.release.permissions.contents).toBe('write');
    expect(workflow.jobs.release.permissions.actions).toBeUndefined();
  });
});
