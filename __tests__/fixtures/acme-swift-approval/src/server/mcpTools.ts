import type { AddonContext } from '@kassis/addon-sdk';
import { createListPendingHandler, LIST_PENDING_TOOL } from '../mcp/listPending.js';

let runtimeCtx: AddonContext | null = null;

export function bindMcpRuntimeContext(ctx: AddonContext): void {
  runtimeCtx = ctx;
}

export const tools = {
  [LIST_PENDING_TOOL]: createListPendingHandler(() => runtimeCtx),
};