import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { AddonContext } from '@kassis/addon-sdk';
import { createTestContext } from '@kassis/addon-testkit';
import {
  LIST_PENDING_TOOL,
  initialize,
  listPendingForMcp,
  tools,
} from '../../dist/server/index.js';
import { createMemoryData } from '../memoryData.ts';

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OWN_MANIFEST = {
  addonId: 'acme-swift-approval',
  manifestPath: path.join(addonRoot, 'manifest.json'),
};

const SERVICE = {
  kind: 'service' as const,
  userId: null,
  email: null,
};

function contextWith(memory: ReturnType<typeof createMemoryData>): AddonContext {
  const ctx = createTestContext({ ...OWN_MANIFEST, principal: SERVICE });
  ctx.data = memory as unknown as AddonContext['data'];
  return ctx;
}

describe('list_pending MCP tool (FR-61)', () => {
  it('returns pending summaries without rawText', async () => {
    const memory = createMemoryData();
    memory.messages.push({
      id: 'msg-1',
      reference: 'REF1',
      amount: '1000.00',
      currency: 'CHF',
      high_value: true,
      status: 'PENDING_APPROVAL',
      message_type: 'MT103',
      sender_bic: 'BANKCHZZ',
      receiver_bic: 'BANKDEFF',
      value_date: '2026-01-01',
      received_at: '2026-01-01T12:00:00Z',
    });
    const ctx = contextWith(memory);
    await initialize(ctx);
    const rows = await listPendingForMcp(ctx);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      id: 'msg-1',
      reference: 'REF1',
      amount: '1000.00',
      currency: 'CHF',
      highValue: true,
    });
    assert.equal('rawText' in (rows[0] as object), false);
  });

  it('exposes a tier 2 handler on the server entry tools export', async () => {
    const memory = createMemoryData();
    const ctx = contextWith(memory);
    await initialize(ctx);
    const handler = tools[LIST_PENDING_TOOL];
    assert.equal(typeof handler, 'function');
    const outcome = await handler({}, ctx);
    assert.deepEqual(outcome, { messages: [] });
    await assert.rejects(handler({}, null), /not initialized/);
  });
});