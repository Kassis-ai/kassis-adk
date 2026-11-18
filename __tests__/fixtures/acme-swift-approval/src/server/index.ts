import { defineAddon } from '@kassis/addon-sdk';
import type { AddonPrincipal, AddonRouter } from '@kassis/addon-sdk';
import { registerApprovals } from './approvals.js';
import { createDispatcher } from './http.js';
import { bindMcpRuntimeContext, tools } from './mcpTools.js';
import { expirePending } from './messages/expire.js';

export { createMessageRecordType } from './approvals.js';
export { createDispatcher } from './http.js';
export { commentRejection } from '../rules/comment.js';
export { isHighValue } from './money.js';
export { readSettings } from './settings.js';
export { applyDecision } from './messages/decide.js';
export { expirePending } from './messages/expire.js';
export { ingestMessage } from './messages/ingest.js';
export { getMessage } from './messages/repository.js';
export { LIST_PENDING_TOOL, listPendingForMcp } from '../mcp/listPending.js';
export { tools };

const EXPIRE_JOB = 'acme-swift-approval.expire';
const NOTICE = 'acme-swift-approval.message.waiting';

const manifestSlice = {
  database: {
    ownedTables: [
      'addon_acme_swift_approval.swift_messages',
      'addon_acme_swift_approval.swift_message_history',
    ] as const,
  },
  data: { retention: 'retain' as const },
};

const servicePrincipal = {
  kind: 'service',
  userId: null,
  email: null,
} as AddonPrincipal;

const addon = defineAddon({
  manifest: manifestSlice,
  async initialize(ctx): Promise<void> {
    await ctx.routes.mount(createDispatcher(ctx) as AddonRouter, {
      permission: 'acme-swift-approval.view',
      path: '/',
    });
    await registerApprovals(ctx);
    bindMcpRuntimeContext(ctx);
    ctx.notify.registerType(NOTICE, {
      category: 'acme-swift-approval',
      defaultChannels: ['in_app'],
    });
    ctx.jobs.register(EXPIRE_JOB, async () => {
      const expired = await expirePending(ctx, servicePrincipal, new Date());
      return { expired: expired.length };
    });
    ctx.jobs.schedule(EXPIRE_JOB, '*/15 * * * *', {});
    ctx.logger.info('acme-swift-approval initialized');
  },
});

export const initialize = addon.initialize;
