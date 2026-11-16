/**
 * MCP tool schemas and router for offline discovery (S2.38 / S2.50).
 */
import type { CommandResult } from './types.ts';
import { failure } from './issues.ts';
import {
  findCoreFeature,
  getEventSchema,
  getExample,
  getFacade,
  getGuardrail,
  getTierMatrix,
  listEvents,
  listExtensionPoints,
  listFacades,
  listGuardrails,
  searchDocs,
} from './mcpDiscovery.ts';

const DISCOVERY_TOOLS = new Set([
  'list_facades',
  'get_facade',
  'list_extension_points',
  'list_events',
  'get_event_schema',
  'get_tier_matrix',
  'list_guardrails',
  'get_guardrail',
  'search_docs',
  'get_example',
  'find_core_feature',
]);

export function isDiscoveryTool(name: string): boolean {
  return DISCOVERY_TOOLS.has(name);
}

export function callDiscoveryTool(name: string, args: Record<string, unknown>): CommandResult {
  if (name === 'list_facades') return listFacades(args);
  if (name === 'get_facade') return getFacade(args);
  if (name === 'list_extension_points') return listExtensionPoints(args);
  if (name === 'list_events') return listEvents(args);
  if (name === 'get_event_schema') return getEventSchema(args);
  if (name === 'get_tier_matrix') return getTierMatrix(args);
  if (name === 'list_guardrails') return listGuardrails(args);
  if (name === 'get_guardrail') return getGuardrail(args);
  if (name === 'search_docs') return searchDocs(args);
  if (name === 'get_example') return getExample(args);
  if (name === 'find_core_feature') return findCoreFeature(args);
  return failure(
    `Unknown discovery tool ${name}`,
    'Use list_facades, get_facade, list_extension_points, list_events, get_event_schema, get_tier_matrix, list_guardrails, get_guardrail, search_docs, get_example, or find_core_feature.'
  );
}

export const DISCOVERY_TOOL_DEFINITIONS = [
  {
    name: 'list_facades',
    description: 'List AddonContext facade methods from the offline tier matrix.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tier: { type: 'number', description: 'Optional 1 or 2 filter.' },
        query: { type: 'string', description: 'Optional substring filter.' },
      },
    },
  },
  {
    name: 'get_facade',
    description: 'Get one facade method: tier availability and permission gate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        method: { type: 'string', description: 'Facade method, e.g. ctx.audit.record.' },
        name: { type: 'string', description: 'Alias for method.' },
      },
    },
  },
  {
    name: 'list_extension_points',
    description: 'List ctx.extend contribution points from packaged discovery data.',
    inputSchema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
    },
  },
  {
    name: 'list_events',
    description: 'List platform event names from packaged schemas.',
    inputSchema: {
      type: 'object' as const,
      properties: { query: { type: 'string' } },
    },
  },
  {
    name: 'get_event_schema',
    description: 'Return the JSON Schema for one platform event.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        event: { type: 'string', description: 'Alias for name.' },
      },
    },
  },
  {
    name: 'get_tier_matrix',
    description: 'Return the offline tier-matrix.json rows (optionally filtered by tier).',
    inputSchema: {
      type: 'object' as const,
      properties: { tier: { type: 'number' } },
    },
  },
  {
    name: 'list_guardrails',
    description: 'List guardrail catalogue rows from @kassis/addon-sdk/guardrails.json.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        group: { type: 'string', description: 'Optional group filter A–F.' },
        query: { type: 'string' },
        inProfile: { type: 'boolean', description: 'When true, only coding-profile guardrails.' },
      },
    },
  },
  {
    name: 'get_guardrail',
    description: 'Return one guardrail catalogue row (group, level, check, KADK code, fix hint).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
        key: { type: 'string', description: 'Alias for id.' },
      },
    },
  },
  {
    name: 'search_docs',
    description: 'Search bundled ADK documentation offline (no network).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
        q: { type: 'string', description: 'Alias for query.' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_example',
    description: 'Return a worked example by id or kind (route, event, job, ui-page, mcp-tool, …).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' },
        kind: { type: 'string' },
        query: { type: 'string' },
      },
    },
  },
  {
    name: 'find_core_feature',
    description:
      'Map a common need (store a file, ask for approval, remind a user, score risk, …) to the core feature, facade or extension point, and an example.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        need: { type: 'string', description: 'Natural-language need, e.g. store a file.' },
        query: { type: 'string', description: 'Alias for need.' },
        q: { type: 'string', description: 'Alias for need.' },
        feature: { type: 'string', description: 'Alias for need.' },
        id: { type: 'string', description: 'Stable feature id from a previous list.' },
      },
    },
  },
] as const;
