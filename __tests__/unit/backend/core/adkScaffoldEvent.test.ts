import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AddonPrincipal } from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldEventOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-event-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
  const result = scaffoldProject({
    dir,
    kind: 'event',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold event', () => {
  it('writes a publisher helper, schema with required fields, and declares events.publishes', async () => {
    const dir = scaffoldEventOnFreshAddon('updated');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.events?.publishes).toEqual(
        expect.arrayContaining([
          { name: 'acme-widget.updated', schema: 'schemas/updated.schema.json' },
        ])
      );

      const schema = JSON.parse(
        fs.readFileSync(path.join(dir, 'schemas/updated.schema.json'), 'utf8')
      );
      expect(schema.eventName).toBe('acme-widget.updated');
      expect(schema.required).toEqual(['subjectId', 'summary']);

      const eventPath = path.join(dir, 'src/server/events/updated.ts');
      const eventSource = fs.readFileSync(eventPath, 'utf8');
      expect(eventSource).toContain("export const updatedEventName = 'acme-widget.updated'");
      expect(eventSource).toContain('export interface UpdatedEventPayload');
      expect(eventSource).toContain(
        'await ctx.events.publish(principal, updatedEventName, payload)'
      );

      const eventModule = await import(pathToFileURL(eventPath).href);
      const principal: AddonPrincipal = {
        kind: 'service',
        userId: null,
        email: null,
      };
      const published: Array<{ name: string; payload: unknown }> = [];
      await eventModule.publishUpdated(
        {
          events: {
            publish: async (_p: AddonPrincipal, name: string, payload: unknown) => {
              published.push({ name, payload });
            },
            subscribe: () => ({ dispose: async () => undefined }),
          },
        },
        principal,
        { subjectId: 'party-1', summary: 'Updated' }
      );
      expect(published).toEqual([
        {
          name: 'acme-widget.updated',
          payload: { subjectId: 'party-1', summary: 'Updated' },
        },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate manifest publishes on a second scaffold of the same event', () => {
    const dir = scaffoldEventOnFreshAddon('synced');
    try {
      const second = scaffoldProject({
        dir,
        kind: 'event',
        id: '',
        name: 'synced',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const names = (manifest.events?.publishes ?? []).map(
        (entry: { name: string }) => entry.name
      );
      expect(names.filter((entry: string) => entry === 'acme-widget.synced').length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});