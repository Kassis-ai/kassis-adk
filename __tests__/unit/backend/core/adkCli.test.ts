import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertEvidencePack, assertNoHostImports } from '../../../../packages/addon-testkit/src/index.mjs';
import { verifyProfileSignature, readBundledProfile } from '../../../../tools/adk/profileBundle.mjs';
import { submitCertifiedRun } from '../../../../tools/adk/registryRun.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');

function run(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message));
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

describe('addon CLI', () => {
  it('accepts the signed coding-agent profile snapshot', () => {
    expect(verifyProfileSignature(readBundledProfile('addon-coding-agent'))).toBe(true);
  });

  it('scaffolds sample-tprm-check outside the repo and packs a passing attestation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-sample-tprm-check-'));
    expect(path.resolve(dir).startsWith(repo)).toBe(false);
    try {
      expect(run(['init', '--id=sample-tprm-check', `--dir=${dir}`], repo).status).toBe(0);
      expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
      expect(run(['check'], dir).status).toBe(0);
      expect(run(['conformance'], dir).status).toBe(0);
      expect(run(['sync', '--profile=addon-coding-agent'], dir).status).toBe(0);
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      const lock = JSON.parse(fs.readFileSync(path.join(dir, '.kassis/agent-profile.lock.json'), 'utf8'));
      const answers = lock.guardrails.map(
        (item: { key: string; verification?: string; checkId?: string }) => ({
          key: item.key,
          outcome: 'followed',
          note: 'rehearsal',
          evidence: item.verification === 'machine' ? { checkId: item.checkId } : null,
        })
      );
      fs.writeFileSync(
        path.join(dir, '.kassis/attestation.json'),
        `${JSON.stringify({ version: lock.version, lockHash: lock.hash, runId: 'rehearsal', answers }, null, 2)}\n`
      );
      const certified = run(['certify', '--json'], dir);
      expect(certified.status).toBe(0);
      expect(JSON.parse(certified.stdout).ok).toBe(true);
      const packed = run(['pack', `--out=${path.join(dir, 'evidence')}`], dir);
      expect(packed.status).toBe(0);
      expect(assertEvidencePack(path.join(dir, 'evidence')).ok).toBe(true);
      assertNoHostImports(fs.readFileSync(path.join(dir, 'src/index.ts'), 'utf8'), 'src/index.ts');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('posts a registry run when certify is given a reachable instance', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/runs')) {
        return { ok: true, status: 201, json: async () => ({ data: { id: 'run-1' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ data: { passed: true } }) };
    };
    const submitted = await submitCertifiedRun({
      instance: 'https://kassis.example',
      token: 'token',
      agentId: 'agent-1',
      profileCode: 'addon-coding-agent',
      answers: [],
      fetchImpl,
    });
    expect(submitted.runId).toBe('run-1');
    expect(calls[0]).toBe('https://kassis.example/api/v1/agent-registry/runs');
    expect(calls[1]).toBe('https://kassis.example/api/v1/agent-registry/runs/run-1/attest');
  });

  it('answers a read-only KADK question from the dev MCP', () => {
    const result = spawnSync(process.execPath, [path.join(repo, 'tools/adk/kassis-adk-mcp.mjs')], {
      input: frame({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kadk_explain', arguments: { code: 'KADK-701' } } }),
      encoding: 'buffer',
    });
    const text = result.stdout.toString('utf8');
    expect(text).toContain('KADK-701');
    expect(result.status).toBe(0);
  });
});
