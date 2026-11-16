import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';

function scaffoldMcpOnFreshAddon(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-scaffold-mcp-'));
  initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
  const result = scaffoldProject({
    dir,
    kind: 'mcp-tool',
    id: '',
    name,
    publisher: '',
    tier: '',
    rung: '',
  });
  expect(result.ok).toBe(true);
  return dir;
}

describe('scaffold mcp-tool', () => {
  it('writes manifest entry, tool handler, contribution module, and offline test', () => {
    const dir = scaffoldMcpOnFreshAddon('ping');
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.contributions?.mcp).toEqual({
        entry: 'dist/mcp/contribution.js',
        tools: ['acme-widget.ping'],
      });

      const toolPath = path.join(dir, 'src/mcp/tools/ping.ts');
      const toolSource = fs.readFileSync(toolPath, 'utf8');
      expect(toolSource).toContain("import { defineMcpTool } from '@kassis/mcp-contract'");
      expect(toolSource).toContain("name: 'acme-widget.ping'");

      const contributionSource = fs.readFileSync(
        path.join(dir, 'src/mcp/contribution.ts'),
        'utf8'
      );
      expect(contributionSource).toContain("import { ping } from './tools/ping.js'");
      expect(contributionSource).toContain('export const tools = [');
      expect(contributionSource).toContain('ping');

      const testPath = path.join(dir, 'test/mcp/ping.mcp.test.ts');
      expect(fs.existsSync(testPath)).toBe(true);

      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@kassis/mcp-contract']).toBeTruthy();
      expect(pkg.scripts.test).toContain('test/**/*.test.ts');

      const testSource = fs.readFileSync(testPath, 'utf8');
      expect(testSource).toContain('acme-widget.ping');
      expect(testSource).toContain('ping.handler');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not duplicate manifest tools on a second scaffold of the same MCP tool', () => {
    const dir = scaffoldMcpOnFreshAddon('status');
    try {
      const second = scaffoldProject({
        dir,
        kind: 'mcp-tool',
        id: '',
        name: 'status',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(second.ok).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const tools = manifest.contributions?.mcp?.tools ?? [];
      expect(tools.filter((tool: string) => tool === 'acme-widget.status').length).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});