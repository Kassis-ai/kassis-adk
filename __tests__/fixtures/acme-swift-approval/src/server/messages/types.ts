export type MessageStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type SwiftMessage = {
  readonly id: string;
  readonly messageType: string;
  readonly reference: string;
  readonly senderBic: string;
  readonly receiverBic: string;
  readonly valueDate: string;
  readonly currency: string;
  readonly amount: string;
  readonly orderingCustomer: string | null;
  readonly beneficiary: string;
  readonly remittanceInfo: string | null;
  readonly rawText: string;
  readonly highValue: boolean;
  readonly status: MessageStatus;
  readonly approvalRequestId: string | null;
  readonly receivedAt: string;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly decisionComment: string | null;
  readonly submittedBy: string | null;
};

export type SwiftMessageSummary = {
  readonly id: string;
  readonly messageType: string;
  readonly reference: string;
  readonly senderBic: string;
  readonly receiverBic: string;
  readonly valueDate: string;
  readonly currency: string;
  readonly amount: string;
  readonly highValue: boolean;
  readonly status: MessageStatus;
  readonly receivedAt: string;
};

export type ListFilter = {
  readonly status: string | null;
  readonly messageType: string | null;
  readonly currency: string | null;
  readonly valueDateFrom: string | null;
  readonly valueDateTo: string | null;
  readonly limit: number;
  readonly offset: number;
};

export function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function asNullable(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return asText(value);
}

export function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 't';
}
