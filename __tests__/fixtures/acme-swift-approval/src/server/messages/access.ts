import type { AddonContext, AddonPrincipal } from '@kassis/addon-sdk';
import { deleteMessage, getMessage } from './repository.js';

const VIEW = 'acme-swift-approval.view';

type WithPermissions = AddonPrincipal & { readonly permissions?: readonly string[] };

function recordIdOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return '';
}

function viewAllowed(principal: AddonPrincipal): boolean {
  if (principal.kind !== 'user' || principal.userId == null) return false;
  const permissions = (principal as WithPermissions).permissions;
  if (!permissions) return true;
  return permissions.includes(VIEW);
}

export async function messageCanAccess(
  ctx: AddonContext,
  principal: AddonPrincipal,
  recordOrId: unknown
): Promise<boolean> {
  if (!viewAllowed(principal)) return false;
  const recordId = recordIdOf(recordOrId);
  if (recordId.length === 0) return false;
  const message = await getMessage(ctx, recordId);
  return message !== null;
}

export async function messageOnDelete(
  ctx: AddonContext,
  principal: AddonPrincipal,
  recordOrId: unknown
): Promise<void> {
  if (principal.kind !== 'user' || principal.userId == null) {
    throw new Error('acme:swift-message delete requires a user');
  }
  if (!viewAllowed(principal)) {
    throw new Error('acme:swift-message delete requires view');
  }
  const recordId = recordIdOf(recordOrId);
  if (recordId.length === 0) return;
  const message = await getMessage(ctx, recordId);
  if (!message) return;
  await deleteMessage(ctx, recordId);
}
