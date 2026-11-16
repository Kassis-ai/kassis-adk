import { randomUUID } from 'node:crypto';
import type { AddonContext, AddonTier2DataClient, JsonObject } from '@kassis/addon-sdk';
import {
  DECIDE_MESSAGE,
  DELETE_HISTORY,
  DELETE_MESSAGE,
  EXPIRE_DUE,
  EXPIRE_ONE,
  FIND_BY_SENDER,
  GET_MESSAGE,
  INSERT_HISTORY,
  INSERT_MESSAGE,
  LIST_MESSAGES,
} from './sql.js';
import { asBool, asNullable, asText, type ListFilter, type SwiftMessage, type SwiftMessageSummary } from './types.js';
import type { ParsedMessage } from '../validation.js';

function dataOf(ctx: AddonContext): AddonTier2DataClient {
  return ctx.data as AddonTier2DataClient;
}

function row(value: JsonObject): SwiftMessage {
  return {
    id: asText(value.id),
    messageType: asText(value.message_type),
    reference: asText(value.reference),
    senderBic: asText(value.sender_bic),
    receiverBic: asText(value.receiver_bic),
    valueDate: asText(value.value_date).slice(0, 10),
    currency: asText(value.currency),
    amount: asText(value.amount),
    orderingCustomer: asNullable(value.ordering_customer),
    beneficiary: asText(value.beneficiary),
    remittanceInfo: asNullable(value.remittance_info),
    rawText: asText(value.raw_text),
    highValue: asBool(value.high_value),
    status: asText(value.status) as SwiftMessage['status'],
    approvalRequestId: asNullable(value.approval_request_id),
    receivedAt: asText(value.received_at),
    decidedBy: asNullable(value.decided_by),
    decidedAt: asNullable(value.decided_at),
    decisionComment: asNullable(value.decision_comment),
    submittedBy: asNullable(value.submitted_by),
  };
}

function summary(value: JsonObject): SwiftMessageSummary {
  return {
    id: asText(value.id),
    messageType: asText(value.message_type),
    reference: asText(value.reference),
    senderBic: asText(value.sender_bic),
    receiverBic: asText(value.receiver_bic),
    valueDate: asText(value.value_date).slice(0, 10),
    currency: asText(value.currency),
    amount: asText(value.amount),
    highValue: asBool(value.high_value),
    status: asText(value.status) as SwiftMessageSummary['status'],
    receivedAt: asText(value.received_at),
  };
}

export async function findBySenderReference(
  ctx: AddonContext,
  senderBic: string,
  reference: string
): Promise<{ id: string; status: string } | null> {
  const result = await dataOf(ctx).query(FIND_BY_SENDER, [senderBic, reference]);
  const first = result.rows[0];
  if (!first) return null;
  return { id: asText(first.id), status: asText(first.status) };
}

export async function insertMessage(
  ctx: AddonContext,
  message: ParsedMessage,
  input: {
    readonly id: string;
    readonly highValue: boolean;
    readonly requestId: string;
    readonly receivedAt: string;
    readonly submittedBy: string | null;
  }
): Promise<number> {
  const inserted = await dataOf(ctx).execute(INSERT_MESSAGE, [
    input.id,
    message.messageType,
    message.reference,
    message.senderBic,
    message.receiverBic,
    message.valueDate,
    message.currency,
    message.amount,
    message.orderingCustomer,
    message.beneficiary,
    message.remittanceInfo,
    message.rawText,
    input.highValue,
    'PENDING_APPROVAL',
    input.requestId,
    input.receivedAt,
    input.submittedBy,
  ]);
  if (inserted.count === 0) return 0;
  await dataOf(ctx).execute(INSERT_HISTORY, [
    randomUUID(),
    input.id,
    null,
    'PENDING_APPROVAL',
    input.submittedBy ?? 'payment-system',
    input.receivedAt,
    null,
  ]);
  return inserted.count;
}

export async function getMessage(ctx: AddonContext, id: string): Promise<SwiftMessage | null> {
  const result = await dataOf(ctx).query(GET_MESSAGE, [id]);
  const first = result.rows[0];
  return first ? row(first) : null;
}

export async function listMessages(
  ctx: AddonContext,
  filter: ListFilter
): Promise<readonly SwiftMessageSummary[]> {
  const result = await dataOf(ctx).query(LIST_MESSAGES, [
    filter.status,
    filter.messageType,
    filter.currency,
    filter.valueDateFrom,
    filter.valueDateTo,
    filter.limit,
    filter.offset,
  ]);
  return result.rows.map(summary);
}

export async function decideMessage(
  ctx: AddonContext,
  input: {
    readonly id: string;
    readonly status: 'APPROVED' | 'REJECTED';
    readonly decidedBy: string;
    readonly decidedAt: string;
    readonly comment: string | null;
    readonly actor: string;
  }
): Promise<boolean> {
  const existing = await getMessage(ctx, input.id);
  if (!existing || existing.status !== 'PENDING_APPROVAL') return false;
  const updated = await dataOf(ctx).execute(DECIDE_MESSAGE, [
    input.id,
    input.status,
    input.decidedBy,
    input.decidedAt,
    input.comment,
  ]);
  if (updated.count === 0) return false;
  await dataOf(ctx).execute(INSERT_HISTORY, [
    randomUUID(),
    input.id,
    'PENDING_APPROVAL',
    input.status,
    input.actor,
    input.decidedAt,
    input.comment,
  ]);
  return true;
}

export async function listPendingReceived(
  ctx: AddonContext
): Promise<readonly { id: string; receivedAt: string }[]> {
  const result = await dataOf(ctx).query(EXPIRE_DUE, []);
  return result.rows.map((item) => ({ id: asText(item.id), receivedAt: asText(item.received_at) }));
}

export async function expireOne(
  ctx: AddonContext,
  id: string,
  at: string,
  actor: string
): Promise<boolean> {
  const updated = await dataOf(ctx).execute(EXPIRE_ONE, [id]);
  if (updated.count === 0) return false;
  await dataOf(ctx).execute(INSERT_HISTORY, [
    randomUUID(),
    id,
    'PENDING_APPROVAL',
    'EXPIRED',
    actor,
    at,
    null,
  ]);
  return true;
}

export async function deleteMessage(ctx: AddonContext, id: string): Promise<void> {
  await dataOf(ctx).execute(DELETE_HISTORY, [id]);
  await dataOf(ctx).execute(DELETE_MESSAGE, [id]);
}
