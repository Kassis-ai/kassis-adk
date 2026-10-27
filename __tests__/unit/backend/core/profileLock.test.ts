import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProfileLock, packEvidence } from '../../../../tools/adk/profileLock.mjs';

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
  });
});
