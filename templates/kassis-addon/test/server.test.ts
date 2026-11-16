import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { createTestContext } from '@kassis/addon-testkit';
import { initialize } from '../src/server/index.ts';

const templateRoot = path.dirname(fileURLToPath(new URL('..', import.meta.url)));

const principal = { kind: 'service' as const, userId: null, email: null };

describe('__ADDON_ID__', () => {
  it('records host calls without a database', async () => {
    const ctx = createTestContext({
      addonId: '__ADDON_ID__',
      manifestPath: path.join(templateRoot, 'manifest.json'),
    });
    await initialize(ctx);
    await ctx.audit.record(principal, '__ADDON_ID__.started', {
      subject: { type: 'addon', id: '__ADDON_ID__' },
    });
    await ctx.events.publish(principal, '__ADDON_ID__.started', {});
    await ctx.jobs.enqueue(principal, '__ADDON_ID__.refresh', {});
    await ctx.llm.invoke(principal, '__ADDON_ID__.summary', {});
    assert.equal(ctx.recorded.audit.length, 1);
    assert.equal(ctx.recorded.events.length, 1);
    assert.equal(ctx.recorded.jobs.length, 1);
    assert.equal(ctx.recorded.llm.length, 1);
    assert.equal(ctx.recorded.audit[0]?.action, '__ADDON_ID__.started');
  });
});
