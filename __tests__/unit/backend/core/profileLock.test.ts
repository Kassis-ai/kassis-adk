import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { blankAttestation, buildProfileLock, packEvidence } from '../../../../tools/adk/profileLock.mjs';

const profile = {
  profileId: 'addon-coding-agent',
  version: '3',
  guardrails: [{ key: 'no-core-edits', severity: 'blocking', verification: 'human' }],
};

describe('profile lock and evidence pack', () => {
  it('pins the same hash for the same profile document', () => {
    const first = buildProfileLock(profile);
    const second = buildProfileLock({ ...profile, guardrails: [...profile.guardrails] });
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes the attestation into the pack only when certify passes', () => {
    const lock = buildProfileLock(profile);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-evidence-'));
    const attestation = {
      version: lock.version,
      lockHash: lock.hash,
      answers: [{ key: 'no-core-edits', outcome: 'followed', note: null, evidence: null }],
    };
    const passed = packEvidence({ lock, attestation, outDir });
    expect(passed.ok).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'attestation.json'))).toBe(true);

    const refused = packEvidence({
      lock,
      attestation: { ...attestation, lockHash: 'nope' },
      outDir: path.join(outDir, 'refused'),
    });
    expect(refused.ok).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'refused', 'attestation.json'))).toBe(false);
    const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')) as {
      changeSummary: { rung: string | null; why: string | null };
      contentHash: string | null;
      cliVersion: string;
      sbom: { components: Array<{ name: string; version: string }> };
      manifestDiff: { tier: { from: number | null; to: number | null } };
    };
    expect(index.changeSummary.rung).toBeNull();
    expect(index.changeSummary.why).toBeNull();
    expect(index.contentHash).toBeNull();
    expect(index.cliVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(index.sbom.components).toEqual([]);
    expect(index.manifestDiff.tier).toEqual({ from: null, to: null });
    const readme = fs.readFileSync(path.join(outDir, 'README.md'), 'utf8');
    expect(readme).toContain('## Change summary');
    expect(readme).toContain('## Manifest diff');
    expect(readme).toContain('## Migrations');
    expect(readme).toContain('contentHash:');
  });

  it('writes null outcomes so a blank attestation fails certify', () => {
    const lock = buildProfileLock(profile);
    const attestation = blankAttestation(lock);
    expect(attestation.answers[0]?.outcome).toBeNull();
    const result = packEvidence({
      lock,
      attestation,
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-evidence-blank-')),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue: { code: string }) => issue.code === 'KADK-714')).toBe(true);
  });

  it('puts the manifest diff, migrations, change summary and signer in the pack', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-evidence-diff-'));
    const lock = buildProfileLock(profile);
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      `${JSON.stringify({
        tier: 2,
        permissions: [{ name: 'sample.view' }, { name: 'sample.edit' }],
        signing: { keyId: 'finger' },
      })}\n`
    );
    fs.mkdirSync(path.join(dir, '.kassis'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.kassis', 'previous-manifest.json'),
      `${JSON.stringify({ tier: 1, permissions: [{ name: 'sample.view' }] })}\n`
    );
    fs.writeFileSync(
      path.join(dir, '.kassis', 'change-summary.json'),
      `${JSON.stringify({ reference: 'T-1', rung: '2', why: 'a route is enough', summary: 'added edit' })}\n`
    );
    fs.mkdirSync(path.join(dir, 'migrations'));
    fs.writeFileSync(path.join(dir, 'migrations', '001_init.up.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(dir, 'migrations', '001_init.down.sql'), 'select 1;\n');
    fs.writeFileSync(path.join(dir, 'migrations', '002_keep.up.sql'), '-- irreversible: keep the column\n');
    fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'sample', version: '0.1.0', dependencies: { leftpad: '1.0.0' } })}\n`);
    const outDir = path.join(dir, 'evidence');
    const result = packEvidence({
      lock,
      attestation: {
        version: lock.version,
        lockHash: lock.hash,
        answers: [{ key: 'no-core-edits', outcome: 'followed', note: null, evidence: null }],
      },
      outDir,
      addonDir: dir,
      checks: null,
    });
    expect(result.ok).toBe(true);
    const index = JSON.parse(fs.readFileSync(path.join(outDir, 'index.json'), 'utf8')) as {
      changeSummary: { reference: string | null; rung: string | null; why: string | null };
      manifestDiff: { tier: { from: number | null; to: number | null }; permissions: { added: string[]; removed: string[] } };
      migrations: Array<{ name: string; up: string; down: string }>;
      signerFingerprint: string | null;
      sbom: { components: Array<{ name: string }> };
    };
    expect(index.changeSummary).toMatchObject({ reference: 'T-1', rung: '2', why: 'a route is enough' });
    expect(index.manifestDiff.tier).toEqual({ from: 1, to: 2 });
    expect(index.manifestDiff.permissions.added).toEqual(['sample.edit']);
    expect(index.migrations).toEqual([
      { name: '001_init.up.sql', up: 'present', down: 'present' },
      { name: '002_keep.up.sql', up: 'present', down: 'irreversible' },
    ]);
    expect(index.signerFingerprint).toBe('finger');
    expect(index.sbom.components.map((component) => component.name)).toEqual(['leftpad']);
  });
});
