import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addonDataSchemaName, validateManifestV2 } from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldMigrationOnFreshAddon(name: string): { dir: string; result: ReturnType<typeof scaffoldProject> } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-migration-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 3 });
  const result = scaffoldProject({
    dir,
    kind: 'migration',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return { dir, result };
}

describe('scaffold migration', () => {
  it('writes up/down SQL, data.schema, database.ownedTables, and warns for tier 2', () => {
    const { dir, result } = scaffoldMigrationOnFreshAddon('snapshot');
    try {
      expect(
        result.issues.some((issue) => issue.severity === 'warning' && issue.code === 'ADK-SCAFFOLD')
      ).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const schema = addonDataSchemaName('acme-widget');
      const qualified = `${schema}.acme_widget_snapshot`;
      expect(manifest.data?.schema).toBe(schema);
      expect(manifest.database?.ownedTables).toEqual([qualified]);

      const stem = String(result.data.name);
      const up = fs.readFileSync(path.join(dir, 'migrations', `${stem}.up.sql`), 'utf8');
      expect(up).toContain(`CREATE TABLE IF NOT EXISTS ${qualified}`);
      const down = fs.readFileSync(path.join(dir, 'migrations', `${stem}.down.sql`), 'utf8');
      expect(down).toContain(`DROP TABLE IF EXISTS ${qualified}`);

      const checked = validateManifestV2(manifest);
      expect(checked.ok).toBe(true);

      const second = scaffoldProject({
        dir,
        kind: 'migration',
        id: '',
        name: 'snapshot',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);

      const manifestAgain = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifestAgain.database?.ownedTables).toEqual([qualified]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});