import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNoHostImports } from '../../../../packages/addon-testkit/src/index.mjs';
import {
  verifyProfileSignature,
  readBundledProfile,
} from '../../../../tools/adk/profileBundle.mjs';
import { submitCertifiedRun } from '../../../../tools/adk/registryRun.mjs';

const repo = path.resolve(import.meta.dirname, '../../../..');
const cli = path.join(repo, 'tools/adk/kassis-addon.mjs');
const mcp = path.join(repo, 'tools/adk/kassis-adk-mcp.mjs');

function run(
  args: string[],
  cwd: string
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mcpText(messages: readonly object[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mcp], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP timed out\n${stdout}\n${stderr}`));
    }, 15000);
    const finish = (): void => {
      clearTimeout(timer);
      child.kill();
      resolve(stdout);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('KADK-701') && !stdout.includes('Content-Length')) finish();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
  });
}

describe('addon CLI', () => {
  it('accepts the signed coding-agent profile snapshot', () => {
    expect(verifyProfileSignature(readBundledProfile('addon-coding-agent'))).toBe(true);
    const version1 = JSON.parse(
      fs.readFileSync(path.join(repo, 'tools/adk/profiles/addon-coding-agent.v1.json'), 'utf8')
    );
    expect(version1.version).toBe('1');
    expect(verifyProfileSignature(version1)).toBe(true);
    const current = readBundledProfile('addon-coding-agent');
    expect(current.version).toBe('2');
    const certify = current.guardrails.find((item: { key: string }) => item.key === 'adk.certify');
    expect(certify.checkIds).toEqual([
      'kassis-addon-check',
      'kassis-addon-conformance',
      'kassis-addon-build',
      'kassis-addon-test',
    ]);
    expect(certify.checkId).toBeUndefined();
    expect(verifyProfileSignature(current.previousVersion)).toBe(true);
  });

  it('scaffolds sample-tprm-check and rejects a blank or hand-written attestation', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-sample-tprm-check-'));
    expect(path.resolve(dir).startsWith(repo)).toBe(false);
    try {
      expect(run(['init', '--id=sample-tprm-check', `--dir=${dir}`], repo).status).toBe(0);
      expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
      expect(run(['check'], dir).status).toBe(0);
      expect(run(['conformance'], dir).status).toBe(0);
      expect(run(['sync', '--profile=addon-coding-agent'], dir).status).toBe(0);
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      expect(run(['attest'], dir).status).toBe(0);
      const attested = JSON.parse(
        fs.readFileSync(path.join(dir, '.kassis/attestation.json'), 'utf8')
      ) as {
        answers: Array<{ outcome: string | null }>;
      };
      expect(attested.answers.every((answer) => answer.outcome === null)).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(dir, '.kassis/agent-profile.lock.json'), 'utf8')
      );
      const blankAnswers = lock.guardrails.map((item: { key: string }) => ({
        key: item.key,
        outcome: '',
        note: null,
        evidence: null,
      }));
      fs.writeFileSync(
        path.join(dir, '.kassis/attestation.json'),
        `${JSON.stringify({ version: lock.version, lockHash: lock.hash, runId: '', answers: blankAnswers }, null, 2)}\n`
      );
      const blank = run(['certify', '--json'], dir);
      expect(blank.status).toBe(1);
      expect(
        JSON.parse(blank.stdout).issues.map((issue: { code: string }) => issue.code)
      ).toContain('KADK-714');
      const answers = lock.guardrails.map((item: { key: string; verification?: string }) => ({
        key: item.key,
        outcome: 'followed',
        note: 'rehearsal',
        evidence: item.verification === 'machine' ? { checkId: 'kassis-addon-certify' } : null,
      }));
      fs.writeFileSync(
        path.join(dir, '.kassis/attestation.json'),
        `${JSON.stringify({ version: lock.version, lockHash: lock.hash, runId: 'rehearsal', answers }, null, 2)}\n`
      );
      const certified = run(['certify', '--json'], dir);
      const certifiedBody = JSON.parse(certified.stdout) as {
        ok: boolean;
        issues: Array<{ code: string }>;
      };
      expect(certified.status).toBe(1);
      expect(certifiedBody.ok).toBe(false);
      expect(certifiedBody.issues.map((issue) => issue.code)).toEqual(['KADK-715', 'KADK-707']);
      const checks = JSON.parse(
        fs.readFileSync(path.join(dir, '.kassis/evidence/checks.json'), 'utf8')
      ) as {
        cliVersion: string;
        nodeVersion: string;
        contentHash: string;
        checks: Array<{
          id: string;
          exitCode: number;
          inputHash: string;
          outputDigest: string;
          durationMs: number;
        }>;
      };
      expect(checks.cliVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(checks.nodeVersion).toBe(process.version);
      expect(checks.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(checks.checks.map((item) => `${item.id}:${item.exitCode}`)).toEqual([
        'kassis-addon-check:0',
        'kassis-addon-conformance:0',
        'kassis-addon-build:1',
        'kassis-addon-test:1',
        'adk.requirements-traced:0',
        'adk.requirement-plan-mapped:0',
        'adk.attest-pinned-profile:0',
      ]);
      expect(
        checks.checks.every(
          (item) =>
            item.inputHash.startsWith('sha256-') &&
            item.outputDigest.startsWith('sha256-') &&
            item.durationMs >= 0
        )
      ).toBe(true);
      const packed = run(['pack', `--out=${path.join(dir, 'evidence')}`], dir);
      expect(packed.status).toBe(1);
      expect(fs.existsSync(path.join(dir, 'evidence', 'index.json'))).toBe(false);
      assertNoHostImports(
        fs.readFileSync(path.join(dir, 'src/server/index.ts'), 'utf8'),
        'src/server/index.ts'
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

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

  it('answers a KADK question from the dev MCP over newline-delimited JSON', async () => {
    const text = await mcpText([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'adk-test', version: '0.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'explain_error', arguments: { code: 'KADK-701' } },
      },
    ]);
    expect(text).toContain('KADK-701');
    expect(text).not.toContain('Content-Length');
  });
});
