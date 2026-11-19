import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateManifestV2 } from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function init(args: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-init-'));
  const result = run(['init', `--dir=${dir}`, ...args]);
  expect(result.status, result.stderr).toBe(0);
  return dir;
}

describe('kassis-addon init', () => {
  it('scaffolds rung 1 as server only', () => {
    const dir = init(['--id=sample-tprm-check', '--publisher=kassis']);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.publisher).toBe('kassis');
      expect(manifest.id).toBe('sample-tprm-check');
      expect(manifest.tier).toBe(2);
      expect(manifest.hostApi).toBe('^1.0.0');
      expect(manifest.resources).toEqual({ memoryMb: 128 });
      expect(manifest.health).toEqual({ path: '/health' });
      expect(manifest.entrypoints.main).toBe('dist/server/index.js');
      expect(manifest.audit).toEqual({ actions: ['sample-tprm-check.started'] });
      expect(manifest.events).toEqual({
        publishes: [
          { name: 'sample-tprm-check.started', schema: 'events/started.schema.json' },
        ],
      });
      expect(manifest.jobs).toEqual({ types: ['sample-tprm-check.refresh'] });
      expect(manifest.prompts).toEqual({ keys: ['sample-tprm-check.summary'] });
      expect(fs.existsSync(path.join(dir, 'events/started.schema.json'))).toBe(true);
      const checked = validateManifestV2(manifest);
      expect(checked.ok, JSON.stringify(checked.issues)).toBe(true);
      expect(manifest.ui).toBeUndefined();
      expect(manifest.signing).toBeUndefined();
      expect(fs.existsSync(path.join(dir, 'src/server/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'src/ui/index.ts'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'migrations'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'test/server.test.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(dir, '.npmrc'))).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.scripts.build).toContain('tools/adk/kassis-addon.mjs');
      expect(pkg.scripts.build).toContain('build');
      expect(pkg.scripts['build:server']).toContain('--only=server');
      expect(pkg.scripts['build:ui']).toContain('--only=ui');
      expect(pkg.scripts.test).toContain('test/server.test.ts');
      expect(pkg.dependencies['@kassis/addon-sdk']).toMatch(/^file:/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('prefixes a bank publisher and keeps rung 2 free of migrations', () => {
    const dir = init(['--id=widget', '--publisher=acme', '--rung=2']);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.id).toBe('acme-widget');
      expect(manifest.publisher).toBe('acme');
      expect(manifest.tier).toBe(2);
      expect(manifest.permissions[0].name).toBe('acme-widget.view');
      expect(manifest.ui.entryFile).toBe('index.js');
      expect(fs.existsSync(path.join(dir, 'src/ui/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'vite.config.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'migrations'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps an id that already has the publisher prefix and adds migrations on rung 3', () => {
    const dir = init(['--id=acme-widget', '--publisher=acme', '--rung=3']);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.id).toBe('acme-widget');
      expect(fs.existsSync(path.join(dir, 'src/ui/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'migrations/0001_init.up.sql'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'migrations/0001_init.down.sql'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses tier 1 for a publisher other than kassis', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-init-tier-'));
    try {
      const result = run(['init', '--id=widget', '--publisher=acme', '--tier=1', `--dir=${dir}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Bank addons are tier 2 only');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows kassis to choose tier 1', () => {
    const dir = init(['--id=sample-tprm-check', '--publisher=kassis', '--tier=1']);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.tier).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a rung outside 1 to 3', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-init-rung-'));
    try {
      const result = run(['init', '--id=widget', '--publisher=acme', '--rung=4', `--dir=${dir}`]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('rung must be 1, 2, or 3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
