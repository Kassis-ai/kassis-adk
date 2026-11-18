import { LIST_PENDING_TOOL } from './listPending.js';

export const addonName = 'acme-swift-approval' as const;

/** Declared in manifest `contributions.mcp.tools`; tier 2 handlers live on the server entry `tools` export. */
export const tools = [
  {
    name: LIST_PENDING_TOOL,
    description:
      'List up to 25 SWIFT messages pending approval (id, reference, amount, currency, highValue). Read-only.',
    access: {
      anyOf: ['acme-swift-approval.view'],
      mutating: false,
    },
  },
];