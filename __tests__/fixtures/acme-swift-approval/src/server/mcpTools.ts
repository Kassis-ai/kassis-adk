import { LIST_PENDING_TOOL, listPendingTool } from '../mcp/listPending.js';

/** Tier 2 MCP handlers. Each receives (args, ctx) from the host; no module state. */
export const tools = {
  [LIST_PENDING_TOOL]: listPendingTool,
};
