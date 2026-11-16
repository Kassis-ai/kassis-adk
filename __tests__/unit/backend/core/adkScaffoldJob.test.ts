import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddonJob } from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldJobOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-job-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
  const result = scaffoldProject({
    dir,
    kind: 'job',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold job', () => {
  it('writes a handler, registers it in initialize, and declares jobs.types', async () => {
    const dir = scaffoldJobOnFreshAddon('refresh');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.jobs?.types).toEqual(expect.arrayContaining(['acme-widget.refresh']));

      const jobPath = path.join(dir, 'src/server/jobs/refresh.ts');
      const jobSource = fs.readFileSync(jobPath, 'utf8');
      expect(jobSource).toContain("export const refreshJobType = 'acme-widget.refresh'");
      expect(jobSource).toContain('ctx.jobs.register(refreshJobType, handleRefresh)');

      const initSource = fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8');
      expect(initSource).toContain("import { registerRefresh } from './jobs/refresh.js';");
      expect(initSource).toContain('registerRefresh(ctx);');

      const jobModule = await import(pathToFileURL(jobPath).href);
      const registered: Array<{ type: string; handler: (job: AddonJob) => Promise<unknown> }> = [];
      jobModule.registerRefresh({
        jobs: {
          register(type: string, handler: (job: AddonJob) => Promise<unknown>) {
            registered.push({ type, handler });
            return { dispose: async () => undefined };
          },
          enqueue: async () => ({ id: 'job-1' }),
          schedule: () => ({ dispose: async () => undefined }),
          status: async () => null,
        },
      });
      expect(registered.map((entry) => entry.type)).toEqual(['acme-widget.refresh']);
      const sampleJob: AddonJob = {
        id: 'j1',
        type: 'acme-widget.refresh',
        data: {},
        attempt: 1,
        principal: {
          kind: 'service',
          userId: 1,
          email: 'addon.acme-widget@service.kassis.local',
        } as AddonJob['principal'],
      };
      await expect(registered[0].handler(sampleJob)).resolves.toEqual({
        ok: true,
        jobType: 'acme-widget.refresh',
        attempt: 1,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate initialize wiring on a second scaffold of the same job file', () => {
    const dir = scaffoldJobOnFreshAddon('sync');
    try {
      const second = scaffoldProject({
        dir,
        kind: 'job',
        id: '',
        name: 'sync',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const initSource = fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8');
      expect(initSource.match(/registerSync\(ctx\)/g)?.length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});