import type { AddonContext, AddonPrincipal } from '@kassis/addon-sdk';
import { readSettings } from '../settings.js';
import { expireOne, listPendingReceived } from './repository.js';

const HOUR_MS = 60 * 60 * 1000;

/** FR-30. Safe to run twice: a row leaves PENDING_APPROVAL on the first success. */
export async function expirePending(
  ctx: AddonContext,
  principal: AddonPrincipal,
  now: Date
): Promise<readonly string[]> {
  const settings = readSettings(ctx.config);
  const cutoff = now.getTime() - settings.expiryHours * HOUR_MS;
  const pending = await listPendingReceived(ctx);
  const expired: string[] = [];
  const at = now.toISOString();
  for (const row of pending) {
    const received = Date.parse(row.receivedAt);
    if (!Number.isFinite(received) || received > cutoff) continue;
    const changed = await expireOne(ctx, row.id, at, principal.userId != null ? String(principal.userId) : 'scheduler');
    if (!changed) continue;
    expired.push(row.id);
    await ctx.audit.record(principal, 'acme-swift-approval.message.expired', {
      subject: { type: 'acme-swift-approval.message', id: row.id },
      outcome: 'success',
      actor: 'service',
      metadata: { expiryHours: settings.expiryHours },
    });
  }
  return expired;
}
