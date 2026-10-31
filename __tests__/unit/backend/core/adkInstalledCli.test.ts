import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runNpm } from '../../../../tools/adk/airgap-bundle.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

function runCli(
  client: string,
  args: string[]
): { status: number | null; stdout: string; stderr: string } {
  const bin = path.join(client, 'node_modules', '@kassis', 'addon-cli', 'bin', 'kassis-addon.mjs');
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: client, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('installed kassis-addon CLI', () => {
  it('runs version, init, check, and MCP initialize from a packed tarball', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-installed-cli-'));
    const packs = path.join(root, 'packs');
    const client = path.join(root, 'client');
    fs.mkdirSync(packs);
    fs.mkdirSync(client);
    try {
      runNpm(['pack', '--workspace', '@kassis/addon-cli', '--pack-destination', packs], repo);
      runNpm(['pack', '--workspace', '@kassis/addon-testkit', '--pack-destination', packs], repo);
      const tarballs = fs
        .readdirSync(packs)
        .filter((name) => name.endsWith('.tgz'))
        .map((name) => path.join(packs, name));
      expect(tarballs).toHaveLength(2);
      runNpm(['init', '-y'], client);
      runNpm(['install', ...tarballs, '--no-fund', '--no-audit'], client);
      const version = runCli(client, ['--version']);
      expect(version.status).toBe(0);
      expect(version.stdout).toContain('kassis-addon 0.1.0');
      const init = runCli(client, ['init', '--id', 'demo', '--publisher', 'acme', '--dir', 'demo']);
      expect(init.status, init.stderr).toBe(0);
      expect(fs.existsSync(path.join(client, 'demo', 'manifest.json'))).toBe(true);
      const check = runCli(client, ['check', '--json', '--dir', 'demo']);
      expect(check.status, `${check.stdout}\n${check.stderr}`).toBe(0);
      expect(check.stdout).toContain('"ok":true');
      const mcp = path.join(
        client,
        'node_modules',
        '@kassis',
        'addon-cli',
        'lib',
        'kassis-adk-mcp.mjs'
      );
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'lab', version: '0' },
        },
      });
      const started = spawnSync(process.execPath, [mcp], {
        input: `${message}\n`,
        encoding: 'utf8',
        timeout: 15000,
      });
      expect(started.status === 0 || started.status === null, started.stderr).toBe(true);
      expect(started.stdout).toContain('protocolVersion');
      const lib = path.join(client, 'node_modules', '@kassis', 'addon-cli', 'lib');
      const files: string[] = [];
      walk(lib, files);
      for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        expect(text, file).not.toContain('packages/');
        expect(text, file).not.toContain(".ts'");
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180000);
});
