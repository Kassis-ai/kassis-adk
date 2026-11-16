import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildProfileLock, blankAttestation } from '../../../../tools/adk/profileLock.mjs';
import { writeAgentRuleFiles } from '../../../../tools/adk/agentRules.mjs';
import { recordMachineChecks } from '../../../../tools/adk/certifyChecks.mjs';
import { verifyProfileSignature } from '../../../../tools/adk/profileBundle.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const draftPath = path.join(repo, 'tools/adk/profiles/addon-coding-agent.v3.draft.json');
const skillKeys = [
  'adk.add-route',
  'adk.add-table',
  'adk.add-event',
  'adk.add-job',
  'adk.add-ui-page',
  'adk.add-mcp-tool',
] as const;

describe('coding profile v3 draft (S2.40)', () => {
  it('ships an unsigned draft with requirements-traced and six coding skills', () => {
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8')) as {
      profileId: string;
      version: string;
      draft: boolean;
      signature?: string;
      guardrails: Array<{
        key: string;
        severity?: string;
        verification: string;
        checkIds?: string[];
      }>;
      skills: Array<{ key: string; title: string; description: string; body: string }>;
      previousVersion: { version: string; signature: string };
    };
    expect(draft.profileId).toBe('addon-coding-agent');
    expect(draft.version).toBe('3');
    expect(draft.draft).toBe(true);
    expect(draft.signature).toBeUndefined();
    expect(verifyProfileSignature(draft)).toBe(false);

    const keys = draft.guardrails.map((item) => item.key);
    expect(keys).toContain('adk.requirements-traced');
    expect(keys).toContain('adk.requirement-plan-mapped');
    expect(keys).toHaveLength(13);
    const blocking = draft.guardrails.filter((item) => item.severity === 'blocking');
    expect(blocking.length).toBeGreaterThan(0);
    for (const item of blocking) {
      expect(item.verification, item.key).toBe('machine');
      expect(item.checkIds?.length, item.key).toBeGreaterThan(0);
    }
    for (const key of [
      'adk.work-in-own-repo',
      'adk.declared-permissions-and-audit',
      'adk.declare-widened-access',
      'adk.no-unrequested-refactors',
    ]) {
      expect(draft.guardrails.find((item) => item.key === key)?.severity).toBe('advisory');
    }
    const traced = draft.guardrails.find((item) => item.key === 'adk.requirements-traced');
    expect(traced).toMatchObject({
      verification: 'machine',
      checkIds: ['adk.requirements-traced'],
    });
    expect(draft.skills.map((skill) => skill.key)).toEqual([...skillKeys]);
    for (const skill of draft.skills) {
      expect(skill.title.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.body).toContain('#');
      const skillDir = skill.key.replace(/\./g, '-');
      expect(
        fs.existsSync(path.join(repo, 'kassis-skills', skillDir, 'SKILL.md'))
      ).toBe(true);
    }
    expect(draft.previousVersion.version).toBe('2');
    expect(verifyProfileSignature(draft.previousVersion)).toBe(true);
  });

  it('pins skills into the profile lock and writes them into agent rules', () => {
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    const lock = buildProfileLock(draft);
    expect(lock.version).toBe('3');
    expect(Array.isArray(lock.skills)).toBe(true);
    expect(lock.skills.map((skill: { key: string }) => skill.key)).toEqual([...skillKeys]);
    expect(blankAttestation(lock).answers).toHaveLength(13);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-profile-v3-'));
    try {
      const files = writeAgentRuleFiles(lock, dir);
      const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
      expect(agents).toContain('adk.requirements-traced');
      expect(agents).toContain('## Skills');
      expect(agents).toContain('adk.add-route');
      expect(files.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records adk.requirements-traced in checks.json for the template', () => {
    const template = path.join(repo, 'templates/kassis-addon');
    const checks = recordMachineChecks(template) as {
      checks: Array<{ id: string; exitCode: number }>;
    };
    const row = checks.checks.find((item) => item.id === 'adk.requirements-traced');
    expect(row).toBeDefined();
    expect(row?.exitCode).toBe(0);
    const planned = checks.checks.find((item) => item.id === 'adk.requirement-plan-mapped');
    expect(planned?.exitCode).toBe(0);
    const attested = checks.checks.find((item) => item.id === 'adk.attest-pinned-profile');
    expect(attested?.exitCode).toBe(0);
  }, 120000);
});
