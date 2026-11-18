import type { AddonContext } from '@kassis/addon-sdk';
import { listMessages } from '../server/messages/repository.js';

export const LIST_PENDING_TOOL = 'acme-swift-approval.list_pending';

const PENDING_LIMIT = 25;

export type ListPendingRow = {
  readonly id: string;
  readonly reference: string;
  readonly amount: string;
  readonly currency: string;
  readonly highValue: boolean;
};

export async function listPendingForMcp(ctx: AddonContext): Promise<readonly ListPendingRow[]> {
  const rows = await listMessages(ctx, {
    status: 'PENDING_APPROVAL',
    messageType: null,
    currency: null,
    valueDateFrom: null,
    valueDateTo: null,
    limit: PENDING_LIMIT,
    offset: 0,
  });
  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    amount: row.amount,
    currency: row.currency,
    highValue: row.highValue,
  }));
}

export function createListPendingHandler(
  ctxOf: () => AddonContext | null
): (args: Record<string, unknown>) => Promise<{ messages: readonly ListPendingRow[] }> {
  return async () => {
    const ctx = ctxOf();
    if (!ctx) throw new Error('addon is not initialized');
    const messages = await listPendingForMcp(ctx);
    return { messages };
  };
}