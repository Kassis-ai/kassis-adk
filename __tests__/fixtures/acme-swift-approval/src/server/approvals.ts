import type {
  AddonContext,
  AddonPrincipal,
  ApprovalOutcome,
  JsonObject,
  RecordTypeDefinition,
} from '@kassis/addon-sdk';
import { defineRecordType } from '@kassis/addon-sdk';
import { applyDecision } from './messages/decide.js';
import { messageCanAccess, messageOnDelete } from './messages/access.js';
import { getMessage } from './messages/repository.js';
import type { SwiftMessage } from './messages/types.js';

const SUBJECT = 'acme-swift-approval.message';
const RESOURCE = 'acme:swift-message';

type RecordArg = string | { readonly id?: string };

function principalOf(value: unknown, outcome: ApprovalOutcome): AddonPrincipal {
  if (value && typeof value === 'object' && 'kind' in value && 'userId' in value) {
    return value as AddonPrincipal;
  }
  return {
    kind: 'user',
    userId: outcome.decidedBy.userId,
    email: outcome.decidedBy.email,
  } as AddonPrincipal;
}

function outcomeOf(value: unknown): ApprovalOutcome | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ApprovalOutcome>;
  if (typeof record.subjectId !== 'string' || !record.decidedBy) return null;
  return record as ApprovalOutcome;
}

function publicFields(message: SwiftMessage): JsonObject {
  return {
    messageType: message.messageType,
    reference: message.reference,
    senderBic: message.senderBic,
    receiverBic: message.receiverBic,
    valueDate: message.valueDate,
    currency: message.currency,
    amount: message.amount,
    highValue: message.highValue,
    status: message.status,
    submittedBy: message.submittedBy,
  };
}

export function createMessageRecordType(ctx: AddonContext): RecordTypeDefinition {
  return defineRecordType({
    type: RESOURCE,
    sensitivity: 'confidential',
    auditSubject: { subjectType: SUBJECT, aliases: ['swift-message'] },
    canAccess: async (principal: AddonPrincipal, recordOrId: RecordArg): Promise<boolean> => {
      const allowed = await messageCanAccess(ctx, principal, recordOrId);
      return allowed;
    },
    onDelete: async (principal: AddonPrincipal, recordOrId: RecordArg): Promise<void> => {
      await messageOnDelete(ctx, principal, recordOrId);
    },
  });
}

type Tier2RecordHost = AddonContext['extend'] & {
  registerRecordAccess(input: {
    resourceType: string;
    canAccess: (principal: AddonPrincipal, recordOrId: RecordArg) => Promise<boolean>;
  }): { dispose(): Promise<void> };
};

export async function registerApprovals(ctx: AddonContext): Promise<void> {
  const recordType = createMessageRecordType(ctx);
  const extend = ctx.extend as Tier2RecordHost;
  extend.registerAuditSubject({
    subjectType: SUBJECT,
    aliases: ['swift-message'],
  });
  extend.registerRecordAccess({
    resourceType: RESOURCE,
    canAccess: (principal, recordOrId) => messageCanAccess(ctx, principal, recordOrId),
  });
  extend.registerDeletable({
    descriptor: {
      family: RESOURCE,
      tableName: 'swift_messages',
      prismaModel: 'swift_messages',
      idCast: 'string',
      flagMode: 'status',
      statusDeletedValue: 'EXPIRED',
      eventDomain: 'SWIFT_MESSAGE',
      permissionNamespace: 'acme-swift-approval',
      retentionFamily: 'swift_message',
    },
    onDelete: recordType.onDelete,
  } as Parameters<AddonContext['extend']['registerDeletable']>[0]);
  extend.registerApprovable({
    subjectType: SUBJECT,
    labelKey: 'acme-swift-approval.message',
    actions: [{ key: 'release', labelKey: 'acme-swift-approval.release', gate: 'hold_action' }],
    fields: [{ key: 'highValue', labelKey: 'acme-swift-approval.highValue', type: 'boolean' }],
    permissions: {
      view: ['acme-swift-approval.view'],
      decide: ['acme-swift-approval.approve'],
      configure: ['acme-swift-approval.admin'],
    },
    load: async (_principal: AddonPrincipal, args: { subjectId?: string } | string) => {
      const subjectId = typeof args === 'string' ? args : (args.subjectId ?? '');
      const message = await getMessage(ctx, subjectId);
      return message ? publicFields(message) : null;
    },
    resolveMakers: async (_principal: AddonPrincipal, args: { subject?: JsonObject }) => {
      const submitted = args.subject?.submittedBy;
      const id = typeof submitted === 'string' ? Number(submitted) : Number.NaN;
      return Number.isInteger(id) ? [id] : [];
    },
    onApproved: async (principal: AddonPrincipal, outcome: ApprovalOutcome) => {
      const decided = outcomeOf(outcome) ?? outcome;
      await applyDecision(ctx, principalOf(principal, decided), decided, 'APPROVED');
    },
    onRejected: async (principal: AddonPrincipal, outcome: ApprovalOutcome) => {
      const decided = outcomeOf(outcome) ?? outcome;
      await applyDecision(ctx, principalOf(principal, decided), decided, 'REJECTED');
    },
  } as unknown as Parameters<AddonContext['extend']['registerApprovable']>[0]);
  await ctx.core.approvals.registerApplier(SUBJECT, async (outcome) => {
    await applyDecision(ctx, principalOf(outcome, outcome), outcome, 'APPROVED');
  });
}
