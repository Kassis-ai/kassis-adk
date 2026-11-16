import { toCents } from './money.js';
import type { SwiftSettings } from './settings.js';

const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export type FieldError = { readonly field: string; readonly reason: string };

export type ParsedMessage = {
  readonly messageType: string;
  readonly reference: string;
  readonly senderBic: string;
  readonly receiverBic: string;
  readonly valueDate: string;
  readonly currency: string;
  readonly amount: string;
  readonly cents: number;
  readonly orderingCustomer: string | null;
  readonly beneficiary: string;
  readonly remittanceInfo: string | null;
  readonly rawText: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function referenceError(reference: string): string | null {
  if (reference.length < 1 || reference.length > 16) return 'Reference must be 1 to 16 characters';
  if (reference.startsWith('/') || reference.endsWith('/') || reference.includes('//')) {
    return 'Reference must not start or end with / or contain //';
  }
  return null;
}

function bounded(value: string, max: number, label: string): FieldError | null {
  if (value.length > max) return { field: label, reason: `${label} is longer than ${max} characters` };
  return null;
}

/** FR-02, FR-03, FR-07. Returns the first failing field and stores nothing. */
export function parseMessage(body: unknown, settings: SwiftSettings): ParsedMessage | FieldError {
  if (!isRecord(body)) return { field: 'body', reason: 'Body must be a JSON object' };
  const messageType = text(body.messageType);
  if (!settings.allowedMessageTypes.includes(messageType)) {
    return { field: 'messageType', reason: 'Message type is not allowed' };
  }
  const reference = text(body.reference);
  const referenceProblem = referenceError(reference);
  if (referenceProblem) return { field: 'reference', reason: referenceProblem };
  const senderBic = text(body.senderBic);
  if (!BIC.test(senderBic)) return { field: 'senderBic', reason: 'Sender BIC is not valid' };
  const receiverBic = text(body.receiverBic);
  if (!BIC.test(receiverBic)) return { field: 'receiverBic', reason: 'Receiver BIC is not valid' };
  const currency = text(body.currency);
  if (!/^[A-Z]{3}$/.test(currency)) return { field: 'currency', reason: 'Currency must be three letters' };
  const amount = text(body.amount);
  const cents = toCents(amount);
  if (cents === null) {
    return { field: 'amount', reason: 'Amount must be a positive decimal with at most 2 places' };
  }
  if (settings.maxAmountPerMessage) {
    const cap = toCents(settings.maxAmountPerMessage);
    if (cap !== null && cents > cap) {
      return { field: 'amount', reason: 'Amount is above maxAmountPerMessage' };
    }
  }
  const valueDate = text(body.valueDate);
  if (!isIsoDate(valueDate)) return { field: 'valueDate', reason: 'Value date must be an ISO date' };
  const orderingRaw = body.orderingCustomer;
  const orderingCustomer = typeof orderingRaw === 'string' ? orderingRaw : '';
  if (messageType === 'MT103' && orderingCustomer.trim().length === 0) {
    return { field: 'orderingCustomer', reason: 'Ordering customer is required for MT103' };
  }
  const orderingError = bounded(orderingCustomer, 140, 'orderingCustomer');
  if (orderingCustomer.length > 0 && orderingError) return orderingError;
  const beneficiary = text(body.beneficiary);
  if (beneficiary.trim().length === 0) return { field: 'beneficiary', reason: 'Beneficiary is required' };
  const beneficiaryError = bounded(beneficiary, 140, 'beneficiary');
  if (beneficiaryError) return beneficiaryError;
  const remittanceRaw = body.remittanceInfo;
  const remittanceInfo = typeof remittanceRaw === 'string' && remittanceRaw.length > 0 ? remittanceRaw : null;
  if (remittanceInfo) {
    const remittanceError = bounded(remittanceInfo, 140, 'remittanceInfo');
    if (remittanceError) return remittanceError;
  }
  const rawText = text(body.rawText);
  if (rawText.length === 0) return { field: 'rawText', reason: 'Raw text is required' };
  if (rawText.length > 10000) return { field: 'rawText', reason: 'Raw text is longer than 10000 characters' };
  return {
    messageType,
    reference,
    senderBic,
    receiverBic,
    valueDate,
    currency,
    amount,
    cents,
    orderingCustomer: orderingCustomer.length > 0 ? orderingCustomer : null,
    beneficiary,
    remittanceInfo,
    rawText,
  };
}

export function isFieldError(value: ParsedMessage | FieldError): value is FieldError {
  return 'field' in value && !('cents' in value);
}
