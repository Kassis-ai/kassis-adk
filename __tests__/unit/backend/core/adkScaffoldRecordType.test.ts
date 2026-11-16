import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateManifestV2 } from '@kassis/addon-sdk';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { recordTypeQualifier } from '../../../../packages/adk-core/src/scaffoldRecordType.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldRecordOnFreshAddon(name: string): { dir: string; result: ReturnType<typeof scaffoldProject> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-record-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
  const result = scaffoldProject({
    dir,
    kind: 'record-type',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return { dir, result };
}

describe('scaffold record-type', () => {
  it('writes manifest resourceTypes, wave 1 extends, retention, and mandatory stubs', async () => {
    const { dir, result } = scaffoldRecordOnFreshAddon('item');
    try {
      expect(result.issues).toEqual([]);
      const qualified = recordTypeQualifier('acme-widget', 'item');
      expect(result.data).toMatchObject({ kind: 'record-type', name: qualified });

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.extends).toEqual(
        expect.arrayContaining(['auditSubject', 'recordAccess', 'deletable'])
      );
      expect(manifest.data?.retention).toBe('retain');
      expect(manifest.resourceTypes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: qualified,
            sensitivity: 'standard',
            viewPermissions: ['acme-widget.view'],
          }),
        ])
      );
      expect(manifest.permissions).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'acme-widget.view' })])
      );

      const checked = validateManifestV2(manifest);
      expect(checked.ok).toBe(true);

      const recordSource = fs.readFileSync(
        path.join(dir, 'src/server/record-types/item.ts'),
        'utf8'
      );
      expect(recordSource).toContain('defineRecordType');
      expect(recordSource).toContain('canAccess is not implemented');
      expect(recordSource).toContain('onDelete is not implemented');

      const registerSource = fs.readFileSync(
        path.join(dir, 'src/server/record-types/register-item.ts'),
        'utf8'
      );
      expect(registerSource).toContain('registerRecordAccess');
      expect(registerSource).toContain('registerDeletable');

      const initSource = fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8');
      expect(initSource).toContain('itemRecordType');
      expect(initSource).toContain('registerItemRecordType(ctx)');

      const testPath = path.join(dir, 'test/server/itemRecordType.test.ts');
      const testSource = fs.readFileSync(testPath, 'utf8');
      expect(testSource.match(/\bit\(/g)?.length).toBe(4);
      expect(testSource).toContain('access:');
      expect(testSource).toContain('delete:');
      expect(testSource).toContain('sensitivity:');
      expect(testSource).toContain('retention:');

      const recordModule = (await import(pathToFileURL(path.join(dir, 'src/server/record-types/item.ts')).href)) as {
        itemRecordType: {
          canAccess: (principal: { kind: 'user'; userId: number; email: string; permissions: string[] }, recordId: string) => Promise<boolean>;
          onDelete: (principal: { kind: 'user'; userId: number; email: string; permissions: string[] }, recordId: string) => Promise<void>;
          sensitivity: string;
        };
      };
      const principal = {
        kind: 'user' as const,
        userId: 1,
        email: 'author@example.com',
        permissions: ['acme-widget.view'],
      };
      await expect(recordModule.itemRecordType.canAccess(principal, 'record-1')).rejects.toThrow(
        /not implemented/i
      );
      await expect(recordModule.itemRecordType.onDelete(principal, 'record-1')).rejects.toThrow(
        /not implemented/i
      );
      expect(recordModule.itemRecordType.sensitivity).toBe('standard');
      expect(manifest.data?.retention).toBe('retain');

      const second = scaffoldProject({
        dir,
        kind: 'record-type',
        id: '',
        name: 'item',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const manifestAgain = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifestAgain.resourceTypes.filter((row: { type: string }) => row.type === qualified)).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});