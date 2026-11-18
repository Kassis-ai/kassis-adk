import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { AddonContext, AddonPrincipal, ApprovalOutcome } from '@kassis/addon-sdk';
import { createTestContext } from '@kassis/addon-testkit';
import {
  applyDecision,
  commentRejection,
  createDispatcher,
  createMessageRecordType,
  expirePending,
  getMessage,
  ingestMessage,
  initialize,
  isHighValue,
  readSettings,
} from '../../dist/server/index.js';
import { createMemoryData } from '../memoryData.ts';

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(addonRoot, 'manifest.json'), 'utf8')) as {
  tier: number;
  resources: { memoryMb: number };
  permissions: { name: string }[];
  audit: { actions: string[] };
  ui: {
    contributions: {
      nav: { section: string; name: string; permission: string }[];
      settingsTabs: { id: string; permissions?: string[] }[];
    };
  };
  contributions?: { mcp?: { entry: string; tools: string[] } };
  data: { retention: string };
  health: { path: string };
};

const S1 = {
  messageType: 'MT103',
  reference: 'ACME20261028001',
  senderBic: 'ACMECHZZXXX',
  receiverBic: 'BETADEZZXXX',
  valueDate: '2026-10-30',
  currency: 'CHF',
  amount: '12500.00',
  orderingCustomer: 'Lab Customer AG, Bahnhofstrasse 1, 8001 Zurich',
  beneficiary: 'Lab Supplier GmbH, Hauptstrasse 5, 10115 Berlin',
  remittanceInfo: 'Invoice 4711',
  rawText: '{1:F01ACMECHZZAXXX0000000000}{4:\n:20:ACME20261028001\n-}',
};

function user(userId: number, permissions: readonly string[]): AddonPrincipal {
  return { kind: 'user', userId, email: 'user@example.com', permissions } as AddonPrincipal;
}

function held(requestId: string) {
  return async () => ({ status: 'held' as const, requestId });
}

function bind(ctx: AddonContext, memory = createMemoryData()): ReturnType<typeof createMemoryData> {
  ctx.data = memory as unknown as AddonContext['data'];
  ctx.core.approvals.isEnforced = async () => true;
  ctx.core.approvals.guard = held('req-1') as AddonContext['core']['approvals']['guard'];
  return memory;
}

describe('acme-swift-approval messages', () => {
  it('FR-01 FR-05 FR-06 FR-08 FR-20 stores a held message without sensitive audit text NFR-02 NFR-08', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    const principal = user(7, ['acme-swift-approval.ingest']);
    const outcome = await ingestMessage(ctx, principal, S1);
    assert.equal(outcome.status, 202);
    if (outcome.status !== 202) return;
    assert.equal(outcome.body.status, 'PENDING_APPROVAL');
    assert.equal(outcome.body.highValue, false);
    assert.equal(outcome.body.requestId, 'req-1');
    const stored = await getMessage(ctx, outcome.body.messageId);
    assert.equal(stored?.submittedBy, '7');
    assert.equal(stored?.rawText, S1.rawText);
    const auditText = JSON.stringify(ctx.recorded.audit);
    assert.equal(auditText.includes('Lab Customer AG'), false);
    assert.equal(auditText.includes(S1.rawText), false);
    assert.equal(ctx.recorded.audit[0]?.action, 'acme-swift-approval.message.received');
  });

  it('FR-02 FR-03 rejects an invalid BIC and stores nothing', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    const memory = bind(ctx);
    const outcome = await ingestMessage(ctx, user(1, ['acme-swift-approval.ingest']), {
      ...S1,
      reference: 'ACME20261028003',
      receiverBic: 'BETA-DE',
    });
    assert.equal(outcome.status, 422);
    if (outcome.status !== 422) return;
    assert.equal(outcome.body.field, 'receiverBic');
    assert.equal(memory.messages.length, 0);
    assert.equal(ctx.recorded.audit[0]?.action, 'acme-swift-approval.message.refused');
    assert.equal(JSON.stringify(ctx.recorded.audit).includes('Lab Customer AG'), false);
  });

  it('FR-04 returns 409 for the same sender and reference', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    const memory = bind(ctx);
    const principal = user(1, ['acme-swift-approval.ingest']);
    assert.equal((await ingestMessage(ctx, principal, S1)).status, 202);
    ctx.core.approvals.guard = held('req-2') as AddonContext['core']['approvals']['guard'];
    const duplicate = await ingestMessage(ctx, principal, S1);
    assert.equal(duplicate.status, 409);
    assert.equal(memory.messages.length, 1);
  });

  it('FR-06 marks a missing threshold and a large MT202 as high value', () => {
    assert.equal(isHighValue('XAU', 1000, { CHF: '1000000' }), true);
    assert.equal(isHighValue('EUR', 250000000, { EUR: '1000000' }), true);
    assert.equal(isHighValue('CHF', 1250000, { CHF: '1000000' }), false);
  });

  it('FR-22 rejects a short reject comment and an approve comment only when required', () => {
    assert.equal(commentRejection('reject', 'no', false), 'reject-comment-short');
    assert.equal(commentRejection('reject', 'not this payment', false), null);
    assert.equal(commentRejection('approve', '', false), null);
    assert.equal(commentRejection('approve', 'short', true), 'approve-comment-required');
  });

  it('FR-24 FR-26 FR-40 approves once, writes history, and ignores a second decision', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    const memory = bind(ctx);
    const ingested = await ingestMessage(ctx, user(4, ['acme-swift-approval.ingest']), S1);
    assert.equal(ingested.status, 202);
    if (ingested.status !== 202) return;
    const outcome: ApprovalOutcome = {
      subjectType: 'acme-swift-approval.message',
      subjectId: ingested.body.messageId,
      action: 'release',
      requestId: 'req-1',
      proposedChange: null,
      decidedBy: { userId: 9, email: 'approver@example.com' },
      comment: 'Released after review',
    };
    const approver = user(9, ['acme-swift-approval.approve']);
    assert.equal(await applyDecision(ctx, approver, outcome, 'APPROVED'), true);
    const stored = await getMessage(ctx, ingested.body.messageId);
    assert.equal(stored?.status, 'APPROVED');
    assert.equal(stored?.decidedBy, '9');
    assert.equal(memory.history.length, 2);
    assert.equal(await applyDecision(ctx, approver, outcome, 'APPROVED'), false);
    assert.equal(stored?.status, 'APPROVED');
    const approved = ctx.recorded.events.find(
      (event) => event.name === 'acme-swift-approval.message.approved'
    );
    assert.ok(approved);
    assert.equal(JSON.stringify(approved?.payload).includes('Lab Customer AG'), false);
    assert.equal(
      ctx.recorded.audit.some((entry) => entry.action === 'acme-swift-approval.message.approved'),
      true
    );
  });

  it('FR-24 reject stores the comment and publishes the rejected event', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    const ingested = await ingestMessage(ctx, user(4, ['acme-swift-approval.ingest']), {
      ...S1,
      messageType: 'MT202',
      reference: 'ACME20261028002',
      currency: 'EUR',
      amount: '2500000.00',
      orderingCustomer: undefined,
      beneficiary: 'GAMMGB2LXXX',
    });
    assert.equal(ingested.status, 202);
    if (ingested.status !== 202) return;
    assert.equal(ingested.body.highValue, true);
    const outcome: ApprovalOutcome = {
      subjectType: 'acme-swift-approval.message',
      subjectId: ingested.body.messageId,
      action: 'release',
      requestId: 'req-1',
      proposedChange: null,
      decidedBy: { userId: 9, email: 'approver@example.com' },
      comment: 'Beneficiary cannot be confirmed',
    };
    assert.equal(await applyDecision(ctx, user(9, ['acme-swift-approval.approve']), outcome, 'REJECTED'), true);
    const stored = await getMessage(ctx, ingested.body.messageId);
    assert.equal(stored?.status, 'REJECTED');
    assert.equal(stored?.decisionComment, 'Beneficiary cannot be confirmed');
    assert.equal(
      ctx.recorded.events.some((event) => event.name === 'acme-swift-approval.message.rejected'),
      true
    );
  });

  it('FR-30 expires a pending message older than expiryHours and leaves a fresh one', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
      config: { expiryHours: 1 },
    });
    const memory = bind(ctx);
    const ingested = await ingestMessage(ctx, user(1, ['acme-swift-approval.ingest']), S1);
    assert.equal(ingested.status, 202);
    if (ingested.status !== 202) return;
    const row = memory.messages[0];
    assert.ok(row);
    row.received_at = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expired = await expirePending(
      ctx,
      { kind: 'service', userId: null, email: null } as AddonPrincipal,
      new Date()
    );
    assert.deepEqual(expired, [ingested.body.messageId]);
    assert.equal((await getMessage(ctx, ingested.body.messageId))?.status, 'EXPIRED');
    assert.equal(
      ctx.recorded.audit.some((entry) => entry.action === 'acme-swift-approval.message.expired'),
      true
    );
    const again = await expirePending(
      ctx,
      { kind: 'service', userId: null, email: null } as AddonPrincipal,
      new Date()
    );
    assert.deepEqual(again, []);
  });

  it('FR-23 access allows a viewer with the record and delete removes it', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    const ingested = await ingestMessage(ctx, user(3, ['acme-swift-approval.ingest']), S1);
    assert.equal(ingested.status, 202);
    if (ingested.status !== 202) return;
    const recordType = createMessageRecordType(ctx);
    const viewer = user(8, ['acme-swift-approval.view']);
    const denied = user(8, ['acme-swift-approval.ingest']);
    assert.equal(await recordType.canAccess(viewer, ingested.body.messageId), true);
    assert.equal(await recordType.canAccess(denied, ingested.body.messageId), false);
    assert.equal(await recordType.canAccess(viewer, 'missing'), false);
    await recordType.onDelete(viewer, ingested.body.messageId);
    assert.equal(await getMessage(ctx, ingested.body.messageId), null);
  });

  it('FR-11 FR-12 FR-13 lists newest first with the default pending filter and a page of 25', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    const memory = bind(ctx);
    const dispatcher = createDispatcher(ctx);
    const principal = user(2, ['acme-swift-approval.view']);
    await ingestMessage(ctx, user(1, ['acme-swift-approval.ingest']), S1);
    const first = memory.messages[0];
    if (first) first.received_at = '2026-10-28T08:00:00.000Z';
    ctx.core.approvals.guard = held('req-2') as AddonContext['core']['approvals']['guard'];
    await ingestMessage(ctx, user(1, ['acme-swift-approval.ingest']), {
      ...S1,
      reference: 'ACME20261028005',
      currency: 'XAU',
      amount: '10.00',
    });
    let body: { messages?: { reference: string; highValue: boolean }[] } = {};
    const res = {
      status() {
        return res;
      },
      json(payload: unknown) {
        body = payload as typeof body;
      },
    };
    await dispatcher(
      { method: 'GET', path: '/queue', query: {}, __kassisPrincipal: principal },
      res
    );
    assert.equal(body.messages?.length, 2);
    assert.equal(body.messages?.[0]?.reference, 'ACME20261028005');
    assert.equal(body.messages?.[0]?.highValue, true);
    assert.equal(JSON.stringify(body).includes('Lab Customer AG'), false);
  });

  it('FR-16 returns raw text on the detail route', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    const ingested = await ingestMessage(ctx, user(1, ['acme-swift-approval.ingest']), S1);
    assert.equal(ingested.status, 202);
    if (ingested.status !== 202) return;
    let body: { message?: { rawText?: string } } = {};
    const res = {
      status() {
        return res;
      },
      json(payload: unknown) {
        body = payload as typeof body;
      },
    };
    await createDispatcher(ctx)(
      {
        method: 'GET',
        path: `/queue/${ingested.body.messageId}`,
        __kassisPrincipal: user(2, ['acme-swift-approval.view']),
      },
      res
    );
    assert.equal(body.message?.rawText, S1.rawText);
  });

  it('FR-01 POST without a forwarded body is refused', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    let status = 0;
    const res = {
      status(code: number) {
        status = code;
        return res;
      },
      json() {
        return undefined;
      },
    };
    await createDispatcher(ctx)(
      { method: 'POST', path: '/messages', __kassisPrincipal: user(1, ['acme-swift-approval.ingest']) },
      res
    );
    assert.equal(status, 503);
  });

  it('FR-50 FR-51 FR-54 defaults and overrides come from config', () => {
    const defaults = readSettings({});
    assert.deepEqual(defaults.allowedMessageTypes, ['MT103', 'MT202']);
    assert.equal(defaults.highValueThresholds.CHF, '1000000');
    assert.equal(defaults.requireApproveComment, false);
    const custom = readSettings({ allowedMessageTypes: ['MT103'], requireApproveComment: true });
    assert.deepEqual(custom.allowedMessageTypes, ['MT103']);
    assert.equal(custom.requireApproveComment, true);
  });

  it('FR-10 FR-17 FR-21 FR-41 FR-56 NFR-01 NFR-03 NFR-05 NFR-07 manifest and UI contract', () => {
    assert.equal(manifest.tier, 2);
    assert.equal(manifest.resources.memoryMb, 256);
    assert.equal(manifest.data.retention, 'retain');
    assert.equal(manifest.health.path, '/health');
    assert.deepEqual(
      manifest.permissions.map((item) => item.name),
      [
        'acme-swift-approval.view',
        'acme-swift-approval.ingest',
        'acme-swift-approval.approve',
        'acme-swift-approval.admin',
      ]
    );
    assert.ok(manifest.audit.actions.includes('acme-swift-approval.message.received'));
    assert.equal(manifest.ui.contributions.nav[0]?.section, 'Payments');
    assert.equal(manifest.ui.contributions.nav[0]?.name, 'SWIFT approvals');
    assert.equal(manifest.ui.contributions.nav[0]?.permission, 'acme-swift-approval.view');
    assert.equal(manifest.ui.contributions.settingsTabs[0]?.id, 'acme-swift-approval');
    assert.deepEqual(manifest.ui.contributions.settingsTabs[0]?.permissions, [
      'acme-swift-approval.admin',
    ]);
    assert.deepEqual(manifest.contributions?.mcp?.tools, ['acme-swift-approval.list_pending']);
    const ui = fs.readFileSync(path.join(addonRoot, 'src/ui/index.ts'), 'utf8');
    const page = fs.readFileSync(path.join(addonRoot, 'src/ui/pages/ApprovalsPage.tsx'), 'utf8');
    assert.match(ui, /settingsTabSlot\(ADDON_ID\)/);
    assert.match(ui, /const ADDON_ID = 'acme-swift-approval'/);
    assert.match(page, /ApprovalStatusPanel/);
    assert.match(page, /useApprovalInbox/);
    assert.match(page, /No messages waiting for release|pages\.approvals\.empty/);
    const en = fs.readFileSync(path.join(addonRoot, 'src/ui/locales/en.json'), 'utf8');
    const fr = fs.readFileSync(path.join(addonRoot, 'src/ui/locales/fr.json'), 'utf8');
    assert.match(en, /No messages waiting for release/);
    assert.match(fr, /Aucun message en attente/);
    const server = fs.readFileSync(path.join(addonRoot, 'src/server/index.ts'), 'utf8');
    assert.equal(server.includes('@/'), false);
    assert.equal(server.includes('from \'server/'), false);
  });

  it('initialize registers the route, the record type and the expiry job', async () => {
    const ctx = createTestContext({
      addonId: 'acme-swift-approval',
      manifestPath: path.join(addonRoot, 'manifest.json'),
    });
    bind(ctx);
    await initialize(ctx);
    assert.equal(ctx.recorded.routes.some((entry) => entry.op === 'mount'), true);
    assert.equal(ctx.recorded.jobs.some((entry) => entry.type === 'acme-swift-approval.expire'), true);
  });
});
