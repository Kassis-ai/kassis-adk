import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startDevHost } from '../../../../packages/adk-core/src/devHost.ts';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const mcp = path.join(repo, 'tools/adk/kassis-adk-mcp.mjs');

function run(args: string[], cwd: string, env?: NodeJS.ProcessEnv): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function listedTools(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mcp], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let listed = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP timed out\n${stdout}\n${stderr}`));
    }, 15000);
    const send = (message: object): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!listed && stdout.includes('"protocolVersion"')) {
        listed = true;
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      }
      if (stdout.includes('validate_manifest') && stdout.includes('scaffold')) {
        clearTimeout(timer);
        child.kill();
        resolve(stdout);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'adk-test', version: '0.0.0' },
      },
    });
  });
}

describe('adk phase H', () => {
  it('exits 0 for --help and names kassis-addon', () => {
    const result = run(['--help'], repo);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: kassis-addon <command>');
    expect(result.stdout).not.toContain('kassis-addon.mjs');
    const initHelp = run(['init', '--help'], repo);
    expect(initHelp.status).toBe(0);
    expect(initHelp.stdout).toContain('--json');
    const version = run(['--version'], repo);
    expect(version.status).toBe(0);
    expect(version.stdout).toContain('kassis-addon 0.1.0');
  });

  it('parses --id value and --id=value', () => {
    const spaced = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-id-space-'));
    const equals = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-id-equals-'));
    try {
      const bySpace = run(['init', '--id', 'sample-tprm-check', '--dir', spaced], repo);
      const byEquals = run(['init', '--id=sample-tprm-check', `--dir=${equals}`], repo);
      expect(bySpace.status, bySpace.stderr).toBe(0);
      expect(byEquals.status, byEquals.stderr).toBe(0);
      const spacedManifest = JSON.parse(fs.readFileSync(path.join(spaced, 'manifest.json'), 'utf8')) as { id: string };
      const equalsManifest = JSON.parse(fs.readFileSync(path.join(equals, 'manifest.json'), 'utf8')) as { id: string };
      expect(spacedManifest.id).toBe('sample-tprm-check');
      expect(equalsManifest.id).toBe(spacedManifest.id);
    } finally {
      fs.rmSync(spaced, { recursive: true, force: true });
      fs.rmSync(equals, { recursive: true, force: true });
    }
  });

  it('prints a KADK code from check --json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-check-json-'));
    try {
      fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({ manifestVersion: 1 })}\n`);
      const result = run(['check', '--json'], dir);
      expect(result.status).toBe(1);
      const body = JSON.parse(result.stdout) as { ok: boolean; issues: Array<{ code: string }> };
      expect(body.ok).toBe(false);
      expect(body.issues.some((issue) => /^KADK-1\d\d$/.test(issue.code))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses migrate when no dev host is running', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-home-'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-migrate-'));
    try {
      const env = { ...process.env, HOME: home, USERPROFILE: home };
      const result = run(['migrate', 'status', '--json'], dir, env);
      expect(result.status).toBe(1);
      const body = JSON.parse(result.stdout) as { ok: boolean; issues: Array<{ code: string; message: string }> };
      expect(body.ok).toBe(false);
      expect(body.issues[0]?.code).toBe('ADK-MIGRATE');
      expect(body.issues[0]?.message).toContain('No dev host');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not start docker when no dev host image is configured', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-dev-'));
    try {
      const result = await startDevHost(dir, '', false);
      expect(result.ok).toBe(false);
      expect(result.issues[0]?.code).toBe('ADK-DEV-IMAGE');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists the four MCP tools over stdio without Content-Length framing', async () => {
    const text = await listedTools();
    expect(text).not.toContain('Content-Length');
    const names = ['validate_manifest', 'run_checks', 'explain_error', 'scaffold'];
    for (const name of names) expect(text).toContain(name);
    expect(text).not.toContain('list_extension_points');
    expect(text).not.toContain('kadk_explain');
  });
});
