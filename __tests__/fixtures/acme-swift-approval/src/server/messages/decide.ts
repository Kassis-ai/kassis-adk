import type { AddonContext, AddonPrincipal, ApprovalOutcome, JsonObject } from '@kassis/addon-sdk';
import { decideMessage, getMessage } from './repository.js';

const SUBJECT = 'acme-swift-approval.message';

export type DecisionStatus = 'APPROVED' | 'REJECTED';

function actorOf(principal: AddonPrincipal, outcome: ApprovalOutcome): string {
  if (principal.userId != null) return String(principal.userId);
  return String(outcome.decidedBy.userId);
}

function eventPayload(message: {
  id: string;
  reference: string;
  senderBic: string;
  receiverBic: string;
  currency: string;
  amount: string;
  valueDate: string;
}, decidedBy: string, decidedAt: string, comment: string): JsonObject {
  return {
    messageId: message.id,
    reference: message.reference,
    senderBic: message.senderBic,
    receiverBic: message.receiverBic,
    currency: message.currency,
    amount: message.amount,
    valueDate: message.valueDate,
    decidedBy,
    decidedAt,
    comment,
  };
}

/** FR-24, FR-26, FR-40. A second decision does not change a row that is no longer pending. */
export async function applyDecision(
  ctx: AddonContext,
  principal: AddonPrincipal,
  outcome: ApprovalOutcome,
  status: DecisionStatus
): Promise<boolean> {
  const message = await getMessage(ctx, outcome.subjectId);
  if (!message || message.status !== 'PENDING_APPROVAL') return false;
  const decidedAt = new Date().toISOString();
  const decidedBy = actorOf(principal, outcome);
  const comment = outcome.comment ?? '';
  const changed = await decideMessage(ctx, {
    id: message.id,
    status,
    decidedBy,
    decidedAt,
    comment: comment.length > 0 ? comment : null,
    actor: decidedBy,
  });
  if (!changed) return false;
  const action =
    status === 'APPROVED'
      ? 'acme-swift-approval.message.approved'
      : 'acme-swift-approval.message.rejected';
  const eventName =
    status === 'APPROVED'
      ? 'acme-swift-approval.message.approved'
      : 'acme-swift-approval.message.rejected';
  await ctx.audit.record(principal, action, {
    subject: { type: SUBJECT, id: message.id },
    outcome: 'success',
    metadata: {
      reference: message.reference,
      decidedBy,
      comment,
    },
  });
  await ctx.events.publish(
    principal,
    eventName,
    eventPayload(message, decidedBy, decidedAt, comment)
  );
  return true;
}
