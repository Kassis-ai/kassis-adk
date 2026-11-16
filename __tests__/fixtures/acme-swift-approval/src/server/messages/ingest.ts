import { randomUUID } from 'node:crypto';
import type { AddonContext, AddonPrincipal } from '@kassis/addon-sdk';
import { isHighValue } from '../money.js';
import { readSettings } from '../settings.js';
import { isFieldError, parseMessage } from '../validation.js';
import { findBySenderReference, insertMessage } from './repository.js';

const SUBJECT = 'acme-swift-approval.message';

export type IngestBody =
  | {
      readonly status: 202;
      readonly body: {
        readonly messageId: string;
        readonly requestId: string;
        readonly status: 'PENDING_APPROVAL';
        readonly highValue: boolean;
      };
    }
  | { readonly status: 409; readonly body: { readonly field: string; readonly reason: string } }
  | { readonly status: 422; readonly body: { readonly field: string; readonly reason: string } }
  | { readonly status: 503; readonly body: { readonly reason: string } };

function makerId(principal: AddonPrincipal): string | null {
  if (principal.kind !== 'user' || principal.userId == null) return null;
  return String(principal.userId);
}

async function auditRefused(
  ctx: AddonContext,
  principal: AddonPrincipal,
  reference: string,
  field: string,
  reason: string
): Promise<void> {
  await ctx.audit.record(principal, 'acme-swift-approval.message.refused', {
    subject: { type: SUBJECT, id: reference.length > 0 ? reference : 'invalid' },
    outcome: 'failure',
    metadata: { field, reason },
  });
}

/** FR-03 through FR-08. Sensitive text stays in the table and out of the audit row. */
export async function ingestMessage(
  ctx: AddonContext,
  principal: AddonPrincipal,
  payload: unknown
): Promise<IngestBody> {
  const settings = readSettings(ctx.config);
  const parsed = parseMessage(payload, settings);
  if (isFieldError(parsed)) {
    const reference =
      payload !== null && typeof payload === 'object' && 'reference' in payload
        ? String((payload as { reference?: unknown }).reference ?? '')
        : '';
    await auditRefused(ctx, principal, reference, parsed.field, parsed.reason);
    return { status: 422, body: { field: parsed.field, reason: parsed.reason } };
  }
  const existing = await findBySenderReference(ctx, parsed.senderBic, parsed.reference);
  if (existing) {
    await auditRefused(ctx, principal, parsed.reference, 'reference', 'Duplicate sender and reference');
    return {
      status: 409,
      body: { field: 'reference', reason: 'Duplicate sender and reference' },
    };
  }
  const enforced = await ctx.core.approvals.isEnforced(SUBJECT);
  if (!enforced) {
    return { status: 503, body: { reason: 'Approval policy is not enforced' } };
  }
  const highValue = isHighValue(parsed.currency, parsed.cents, settings.highValueThresholds);
  const messageId = randomUUID();
  const guard = await ctx.core.approvals.guard(principal, {
    subjectType: SUBJECT,
    subjectId: messageId,
    action: 'release',
    proposedChange: {
      messageType: parsed.messageType,
      reference: parsed.reference,
      senderBic: parsed.senderBic,
      receiverBic: parsed.receiverBic,
      valueDate: parsed.valueDate,
      currency: parsed.currency,
      amount: parsed.amount,
      highValue,
    },
  });
  if (guard.status !== 'held') {
    return { status: 503, body: { reason: 'Approval policy did not hold the release' } };
  }
  const receivedAt = new Date().toISOString();
  const stored = await insertMessage(ctx, parsed, {
    id: messageId,
    highValue,
    requestId: guard.requestId,
    receivedAt,
    submittedBy: makerId(principal),
  });
  if (stored === 0) {
    await auditRefused(ctx, principal, parsed.reference, 'reference', 'Duplicate sender and reference');
    return {
      status: 409,
      body: { field: 'reference', reason: 'Duplicate sender and reference' },
    };
  }
  await ctx.audit.record(principal, 'acme-swift-approval.message.received', {
    subject: { type: SUBJECT, id: messageId },
    outcome: 'success',
    metadata: {
      reference: parsed.reference,
      messageType: parsed.messageType,
      currency: parsed.currency,
      amount: parsed.amount,
      highValue,
      senderBic: parsed.senderBic,
      receiverBic: parsed.receiverBic,
    },
  });
  ctx.logger.info('swift message stored', { messageId, reference: parsed.reference, highValue });
  return {
    status: 202,
    body: { messageId, requestId: guard.requestId, status: 'PENDING_APPROVAL', highValue },
  };
}
