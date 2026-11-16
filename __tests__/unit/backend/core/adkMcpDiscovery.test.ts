import { describe, expect, it } from 'vitest';
import {
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
} from '../../../../packages/adk-core/src/mcpDiscovery.ts';
import {
  callDiscoveryTool,
  DISCOVERY_TOOL_DEFINITIONS,
  isDiscoveryTool,
} from '../../../../packages/adk-core/src/mcpDiscoveryDefs.ts';
import { runContainedTool } from '../../../../packages/adk-core/src/mcpServer.ts';

const DISCOVERY_NAMES = [
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
] as const;

describe('offline ADK MCP discovery tools (S2.38)', () => {
  it('registers the ten discovery tool definitions', () => {
    expect(DISCOVERY_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([...DISCOVERY_NAMES]);
    for (const name of DISCOVERY_NAMES) {
      expect(isDiscoveryTool(name)).toBe(true);
    }
  });

  it('list_guardrails and get_guardrail read guardrails.json offline', () => {
    const listed = listGuardrails({ inProfile: true });
    expect(listed.ok).toBe(true);
    expect(Number(listed.data.count)).toBeGreaterThanOrEqual(11);
    const guardrails = listed.data.guardrails as { id: string }[];
    expect(guardrails.some((row) => row.id === 'adk.certify')).toBe(true);

    const one = getGuardrail({ id: 'adk.requirements-traced' });
    expect(one.ok).toBe(true);
    const guardrail = one.data.guardrail as { kadkCode: string; check: string };
    expect(guardrail.kadkCode).toBe('KADK-718');
    expect(guardrail.check).toBe('adk.requirements-traced');
  });

  it('list_facades and get_tier_matrix read packaged tier-matrix.json offline', () => {
    const listed = listFacades({});
    expect(listed.ok).toBe(true);
    expect(listed.data.mode).toBe('offline');
    expect(Number(listed.data.count)).toBeGreaterThan(10);
    const methods = listed.data.methods;
    expect(Array.isArray(methods)).toBe(true);
    expect(
      (methods as { method: string }[]).some((row) => row.method === 'ctx.audit.record')
    ).toBe(true);

    const tier2 = getTierMatrix({ tier: 2 });
    expect(tier2.ok).toBe(true);
    const tier2Methods = tier2.data.methods as { method: string; tier2: boolean }[];
    expect(tier2Methods.every((row) => row.tier2)).toBe(true);
    expect(tier2Methods.some((row) => row.method === 'ctx.audit.record')).toBe(true);
  });

  it('get_facade returns one method and refuses unknown names', () => {
    const found = getFacade({ method: 'ctx.audit.record' });
    expect(found.ok).toBe(true);
    const facade = found.data.facade as { method: string; tier1: boolean; tier2: boolean };
    expect(facade.method).toBe('ctx.audit.record');
    expect(facade.tier1).toBe(true);
    expect(facade.tier2).toBe(true);

    const missing = getFacade({ method: 'ctx.not.a.real.facade' });
    expect(missing.ok).toBe(false);
    expect(missing.issues[0]?.code).toBe('ADK-DISCOVERY');
  });

  it('list_extension_points returns packaged ctx.extend points', () => {
    const result = listExtensionPoints({});
    expect(result.ok).toBe(true);
    expect(Number(result.data.count)).toBeGreaterThan(10);
    const points = result.data.points as { id: string; method: string }[];
    expect(points.some((point) => point.id === 'approvable')).toBe(true);
    expect(points.some((point) => point.method === 'ctx.extend.registerApprovable')).toBe(true);
  });

  it('list_events and get_event_schema return platform schemas offline', () => {
    const listed = listEvents({ query: 'party.' });
    expect(listed.ok).toBe(true);
    const events = listed.data.events as { name: string }[];
    expect(events.some((event) => event.name === 'party.sanctions_hit')).toBe(true);

    const schema = getEventSchema({ name: 'addon.lifecycle.changed' });
    expect(schema.ok).toBe(true);
    expect(schema.data.name).toBe('addon.lifecycle.changed');
    const body = schema.data.schema as { eventName?: string; type?: string };
    expect(body.eventName).toBe('addon.lifecycle.changed');
    expect(body.type).toBe('object');
  });

  it('search_docs finds bundled ADK documentation without network', () => {
    const result = searchDocs({ query: 'tier matrix' });
    expect(result.ok).toBe(true);
    expect(result.data.mode).toBe('offline');
    expect(Number(result.data.count)).toBeGreaterThan(0);
    const results = result.data.results as { path: string; excerpt: string }[];
    expect(results[0]?.excerpt.length).toBeGreaterThan(0);
  });

  it('get_example returns scaffold and facade examples', () => {
    const byKind = getExample({ kind: 'route' });
    expect(byKind.ok).toBe(true);
    expect(byKind.data.example).toBeTruthy();

    const byId = getExample({ id: 'scaffold-mcp-tool' });
    expect(byId.ok).toBe(true);
    const example = byId.data.example as { kind: string; snippet: string };
    expect(example.kind).toBe('mcp-tool');
    expect(example.snippet).toContain('defineMcpTool');
  });

  it('runContainedTool serves discovery tools without a project dir', () => {
    const result = runContainedTool('/tmp', 'list_facades', {});
    expect(result.ok).toBe(true);
    expect(callDiscoveryTool('list_events', {}).ok).toBe(true);
  });
});
