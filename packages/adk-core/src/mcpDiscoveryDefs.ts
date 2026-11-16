/**
 * MCP tool schemas and router for offline discovery (S2.38).
 */
import type { CommandResult } from './types.ts';
import { failure } from './issues.ts';
import {
  getEventSchema,
  getExample,
  getFacade,
  getTierMatrix,
  listEvents,
  listExtensionPoints,
  listFacades,
  searchDocs,
} from './mcpDiscovery.ts';

const DISCOVERY_TOOLS = new Set([
  'list_facades',
  'get_facade',
  'list_extension_points',
  'list_events',
  'get_event_schema',
  'get_tier_matrix',
  'search_docs',
  'get_example',
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
  if (name === 'search_docs') return searchDocs(args);
  if (name === 'get_example') return getExample(args);
  return failure(
    `Unknown discovery tool ${name}`,
    'Use list_facades, get_facade, list_extension_points, list_events, get_event_schema, get_tier_matrix, search_docs, or get_example.'
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
] as const;
