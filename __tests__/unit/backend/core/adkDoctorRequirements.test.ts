import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkAddonTierRefusals } from '@kassis/addon-testkit';
import { doctorProject } from '../../../../packages/adk-core/src/doctor.ts';

function writeManifest(dir: string, body: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ manifestVersion: 2, hostApi: '^1.0.0', publisher: 'acme', version: '0.1.0', ...body }, null, 2)}\n`
  );
}

function writeServerSource(dir: string, source: string): void {
  const serverDir = path.join(dir, 'src', 'server');
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, 'index.ts'), source);
}

describe('doctor --requirements', () => {
  it('flags tier 2 ctx.locks.acquire in source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-doctor-req-'));
    try {
      writeManifest(dir, { id: 'acme-lab', name: 'Lab', tier: 2 });
      writeServerSource(
        dir,
        `import type { AddonContext } from '@kassis/addon-sdk';
export async function initialize(ctx: AddonContext): Promise<void> {
  await ctx.locks.acquire('demo-key');
}`
      );
      const issues = checkAddonTierRefusals(dir, 2);
      expect(issues.map((issue) => issue.method)).toEqual(['ctx.locks.acquire']);
      expect(issues[0]?.code).toBe('KADK-219');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not flag allowed tier 2 facades in template-style tests', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-doctor-req-'));
    try {
      writeManifest(dir, { id: 'acme-ok', name: 'Ok', tier: 2 });
      const testDir = path.join(dir, 'test');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(
        path.join(testDir, 'server.test.ts'),
        `import { createTestContext } from '@kassis/addon-testkit';
const ctx = createTestContext({ tier: 2 });
await ctx.audit.record({ kind: 'service', userId: null, email: null }, 'acme-ok.started', {
  subject: { type: 'addon', id: 'acme-ok' },
});
`
      );
      const issues = checkAddonTierRefusals(dir, 2);
      expect(issues).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('doctorProject with requirements merges KADK-219 issues', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-doctor-req-'));
    try {
      writeManifest(dir, { id: 'acme-cap', name: 'Cap', tier: 2 });
      writeServerSource(
        dir,
        `import type { AddonContext } from '@kassis/addon-sdk';
export async function initialize(ctx: AddonContext): Promise<void> {
  ctx.capabilities.provide('acme-cap.lookup', () => null);
}`
      );
      const result = await doctorProject(dir, { requirements: true });
      expect(result.data.requirementsScan).toBe(true);
      expect(result.data.addonTier).toBe(2);
      expect(result.issues.some((issue) => issue.code === 'KADK-219')).toBe(true);
      expect(result.ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows ctx.capabilities.provide for tier 1', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-doctor-req-'));
    try {
      writeManifest(dir, { id: 'kassis-sample', name: 'Sample', tier: 1, publisher: 'kassis' });
      writeServerSource(
        dir,
        `import type { AddonContext } from '@kassis/addon-sdk';
export async function initialize(ctx: AddonContext): Promise<void> {
  ctx.capabilities.provide('kassis-sample.lookup', () => null);
}`
      );
      expect(checkAddonTierRefusals(dir, 1)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});