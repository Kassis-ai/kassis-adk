import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rollbackProject, statusProject } from '../../../../packages/adk-core/src/packageCommand.ts';

describe('rollbackProject', () => {
  const token = 'test-token';
  const instance = 'https://kassis.example';
  let previousToken: string | undefined;

  beforeEach(() => {
    previousToken = process.env.KASSIS_ADK_TOKEN;
    process.env.KASSIS_ADK_TOKEN = token;
  });

  afterEach(() => {
    if (previousToken === undefined) delete process.env.KASSIS_ADK_TOKEN;
    else process.env.KASSIS_ADK_TOKEN = previousToken;
    vi.unstubAllGlobals();
  });

  it('requires KASSIS_ADK_TOKEN', async () => {
    delete process.env.KASSIS_ADK_TOKEN;
    const result = await rollbackProject(instance, 'demo-addon', '1.0.0');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('ADK-ROLLBACK');
    expect(result.issues[0]?.message).toContain('KASSIS_ADK_TOKEN');
  });

  it('requires --instance', async () => {
    const result = await rollbackProject('', 'demo-addon', '1.0.0');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('rollback --instance');
  });

  it('requires addon id and target version', async () => {
    const missingId = await rollbackProject(instance, '', '1.0.0');
    expect(missingId.ok).toBe(false);
    expect(missingId.issues[0]?.message).toContain('addon id');

    const missingVersion = await rollbackProject(instance, 'demo-addon', '');
    expect(missingVersion.ok).toBe(false);
    expect(missingVersion.issues[0]?.message).toContain('targetVersion');
  });

  it('posts rollback and returns switched outcome on HTTP 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          data: { outcome: 'switched', addonId: 'demo-addon', version: '1.0.0' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await rollbackProject(instance, 'demo-addon', '1.0.0');

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      outcome: 'switched',
      addonId: 'demo-addon',
      version: '1.0.0',
      httpStatus: 200,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/api/v1/platform/addons/demo-addon/rollback');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({ targetVersion: '1.0.0' });
  });

  it('returns held outcome with request id on HTTP 202', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 202,
        text: async () =>
          JSON.stringify({
            success: true,
            data: {
              outcome: 'held',
              addonId: 'demo-addon',
              version: '1.0.0',
              requestId: 'req-7',
              deploymentId: 'dep-1',
            },
          }),
      })
    );

    const result = await rollbackProject(instance, 'demo-addon', '1.0.0');

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      outcome: 'held',
      requestId: 'req-7',
      deploymentId: 'dep-1',
      httpStatus: 202,
    });
  });

  it('fails when the instance returns an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 403,
        text: async () => JSON.stringify({ error: 'Forbidden' }),
      })
    );

    const result = await rollbackProject(instance, 'demo-addon', '1.0.0');

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('ADK-ROLLBACK');
    expect(result.issues[0]?.message).toContain('403');
  });
});

describe('statusProject instance label', () => {
  it('uses status in the missing instance message', async () => {
    const result = await statusProject('');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('status --instance');
  });
});