import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { attestPinnedProfileCheck } from '../../../../tools/adk/certifyChecks.mjs';
import { buildProfileLock } from '../../../../tools/adk/profileLock.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const draftPath = path.join(repo, 'packages/adk-core/profiles/addon-coding-agent.v3.draft.json');

function writeJson(file: string, value: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe('blocking guardrail machine checks (S2.46)', () => {
  it('passes adk.attest-pinned-profile when nothing is pinned', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-attest-none-'));
    try {
      const row = attestPinnedProfileCheck(dir) as { id: string; exitCode: number };
      expect(row.id).toBe('adk.attest-pinned-profile');
      expect(row.exitCode).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when the attestation answers every pinned guardrail', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-attest-ok-'));
    try {
      const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
      const lock = buildProfileLock(draft);
      const answers = lock.guardrails.map((item: { key: string; severity: string }) => ({
        key: item.key,
        outcome: item.severity === 'advisory' ? 'not_applicable' : 'followed',
        note: item.severity === 'advisory' ? 'advisory' : 'answered',
        evidence: null,
      }));
      writeJson(path.join(dir, '.kassis/agent-profile.lock.json'), lock);
      writeJson(path.join(dir, '.kassis/attestation.json'), {
        version: lock.version,
        lockHash: lock.hash,
        runId: 's2.46',
        answers,
      });
      const row = attestPinnedProfileCheck(dir) as { exitCode: number; output: string };
      expect(row.exitCode).toBe(0);
      expect(row.output).toContain('attestation answers');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when the attestation hash does not match the lock', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-attest-hash-'));
    try {
      const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
      const lock = buildProfileLock(draft);
      writeJson(path.join(dir, '.kassis/agent-profile.lock.json'), lock);
      writeJson(path.join(dir, '.kassis/attestation.json'), {
        version: lock.version,
        lockHash: 'not-the-lock',
        runId: 's2.46',
        answers: lock.guardrails.map((item: { key: string }) => ({
          key: item.key,
          outcome: 'followed',
          note: null,
          evidence: null,
        })),
      });
      const row = attestPinnedProfileCheck(dir) as { exitCode: number; output: string };
      expect(row.exitCode).toBe(1);
      expect(row.output).toContain('does not match');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a pinned guardrail has no answer', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-attest-miss-'));
    try {
      const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
      const lock = buildProfileLock(draft);
      writeJson(path.join(dir, '.kassis/agent-profile.lock.json'), lock);
      writeJson(path.join(dir, '.kassis/attestation.json'), {
        version: lock.version,
        lockHash: lock.hash,
        runId: 's2.46',
        answers: [{ key: lock.guardrails[0].key, outcome: 'followed', note: null, evidence: null }],
      });
      const row = attestPinnedProfileCheck(dir) as { exitCode: number; output: string };
      expect(row.exitCode).toBe(1);
      expect(row.output).toContain('missing answer');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
