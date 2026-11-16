/**
 * Offline ADK MCP discovery tools (S2.38 / B7).
 * Reads packaged JSON under ./discovery and @kassis/addon-sdk/tier-matrix.json.
 * Optional live catalog mode waits on S2.36 (GET /api/v1/adk/catalog).
 */
import type { CommandResult } from './types.ts';
import { commandResult, failure, operationalIssue } from './issues.ts';
import {
  argString,
  facadeArea,
  loadDocs,
  loadExamples,
  loadExtensionPoints,
  loadGuardrailCatalogRows,
  loadPlatformEvents,
  loadTierMatrixRows,
  rowToJson,
  type DocEntry,
} from './mcpDiscoveryData.ts';

export function listFacades(args: Record<string, unknown> = {}): CommandResult {
  const tierFilter = typeof args.tier === 'number' ? args.tier : Number(argString(args, 'tier') || NaN);
  const query = argString(args, 'query').toLowerCase();
  let rows = loadTierMatrixRows();
  if (tierFilter === 1) rows = rows.filter((row) => row.tier1);
  if (tierFilter === 2) rows = rows.filter((row) => row.tier2);
  if (query) {
    rows = rows.filter(
      (row) =>
        row.method.toLowerCase().includes(query) ||
        (row.note && row.note.toLowerCase().includes(query)) ||
        (row.permission && row.permission.toLowerCase().includes(query))
    );
  }
  const areas = new Map<string, number>();
  for (const row of rows) {
    const area = facadeArea(row.method);
    areas.set(area, (areas.get(area) || 0) + 1);
  }
  return commandResult([], {
    mode: 'offline',
    count: rows.length,
    areas: [...areas.entries()].map(([area, count]) => ({ area, count })),
    methods: rows.map((row) => rowToJson(row)),
  });
}

export function getFacade(args: Record<string, unknown>): CommandResult {
  const method = argString(args, 'method') || argString(args, 'name');
  if (!method) {
    return failure('method is required', 'Pass method such as ctx.audit.record.');
  }
  const normalized = method.startsWith('ctx.') ? method : `ctx.${method}`;
  const row = loadTierMatrixRows().find((item) => item.method === normalized);
  if (!row) {
    return commandResult(
      [
        operationalIssue(
          'ADK-DISCOVERY',
          'error',
          `Unknown facade ${normalized}`,
          'Call list_facades or check @kassis/addon-sdk/tier-matrix.json.'
        ),
      ],
      { method: normalized }
    );
  }
  return commandResult([], { mode: 'offline', facade: rowToJson(row), area: facadeArea(row.method) });
}

export function listExtensionPoints(args: Record<string, unknown> = {}): CommandResult {
  const query = argString(args, 'query').toLowerCase();
  let points = loadExtensionPoints();
  if (query) {
    points = points.filter(
      (point) =>
        point.id.toLowerCase().includes(query) ||
        point.method.toLowerCase().includes(query) ||
        point.summary.toLowerCase().includes(query)
    );
  }
  return commandResult([], {
    mode: 'offline',
    count: points.length,
    points: points.map((point) => ({
      id: point.id,
      method: point.method,
      manifestExtendsId: point.manifestExtendsId,
      summary: point.summary,
      ...(point.note ? { note: point.note } : {}),
    })),
  });
}

export function listEvents(args: Record<string, unknown> = {}): CommandResult {
  const query = argString(args, 'query').toLowerCase();
  let events = loadPlatformEvents();
  if (query) {
    events = events.filter((event) => event.name.toLowerCase().includes(query));
  }
  return commandResult([], {
    mode: 'offline',
    count: events.length,
    events: events.map((event) => ({ name: event.name, source: event.source })),
  });
}

export function getEventSchema(args: Record<string, unknown>): CommandResult {
  const name = argString(args, 'name') || argString(args, 'event');
  if (!name) {
    return failure('name is required', 'Pass an event name from list_events.');
  }
  const event = loadPlatformEvents().find((item) => item.name === name);
  if (!event) {
    return commandResult(
      [
        operationalIssue(
          'ADK-DISCOVERY',
          'error',
          `Unknown event ${name}`,
          'Call list_events for platform event names shipped in the kit.'
        ),
      ],
      { name }
    );
  }
  return commandResult([], {
    mode: 'offline',
    name: event.name,
    source: event.source,
    schema: event.schema,
  });
}

export function listGuardrails(args: Record<string, unknown> = {}): CommandResult {
  const group = argString(args, 'group').toUpperCase();
  const query = argString(args, 'query').toLowerCase();
  const profileOnly = args.inProfile === true || argString(args, 'inProfile') === 'true';
  let rows = loadGuardrailCatalogRows();
  if (group) rows = rows.filter((row) => row.group === group);
  if (profileOnly) rows = rows.filter((row) => row.inProfile === true);
  if (query) {
    rows = rows.filter(
      (row) =>
        row.id.toLowerCase().includes(query) ||
        row.fixHint.toLowerCase().includes(query) ||
        row.check.toLowerCase().includes(query)
    );
  }
  return commandResult([], {
    mode: 'offline',
    count: rows.length,
    guardrails: rows.map((row) => ({
      id: row.id,
      group: row.group,
      level: row.level,
      check: row.check,
      kadkCode: row.kadkCode,
      ...(row.inProfile ? { inProfile: true } : {}),
    })),
  });
}

export function getGuardrail(args: Record<string, unknown>): CommandResult {
  const id = argString(args, 'id') || argString(args, 'key');
  if (!id) {
    return failure('id is required', 'Pass a guardrail id from list_guardrails, e.g. adk.certify.');
  }
  const row = loadGuardrailCatalogRows().find((item) => item.id === id);
  if (!row) {
    return commandResult(
      [
        operationalIssue(
          'ADK-DISCOVERY',
          'error',
          `Unknown guardrail ${id}`,
          'Call list_guardrails or read @kassis/addon-sdk/guardrails.json.'
        ),
      ],
      { id }
    );
  }
  return commandResult([], { mode: 'offline', guardrail: row });
}

export function getTierMatrix(args: Record<string, unknown> = {}): CommandResult {
  const tierFilter = typeof args.tier === 'number' ? args.tier : Number(argString(args, 'tier') || NaN);
  let rows = loadTierMatrixRows();
  if (tierFilter === 1) rows = rows.filter((row) => row.tier1);
  if (tierFilter === 2) rows = rows.filter((row) => row.tier2);
  return commandResult([], {
    mode: 'offline',
    schemaVersion: 1,
    count: rows.length,
    methods: rows.map((row) => rowToJson(row)),
  });
}

function scoreDoc(doc: DocEntry, terms: string[]): number {
  const hay = `${doc.title}\n${doc.path}\n${doc.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (doc.title.toLowerCase().includes(term)) score += 8;
    if (doc.path.toLowerCase().includes(term)) score += 4;
    let from = 0;
    while (from < hay.length) {
      const at = hay.indexOf(term, from);
      if (at < 0) break;
      score += 1;
      from = at + term.length;
    }
  }
  return score;
}

function excerptAround(text: string, term: string, radius = 160): string {
  const lower = text.toLowerCase();
  const at = lower.indexOf(term.toLowerCase());
  if (at < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + term.length + radius);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}

export function searchDocs(args: Record<string, unknown>): CommandResult {
  const query = argString(args, 'query') || argString(args, 'q');
  if (!query) {
    return failure('query is required', 'Pass query text to search bundled ADK docs.');
  }
  const limitRaw = Number(argString(args, 'limit') || args.limit || 8);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 25) : 8;
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9._-]+/i)
    .filter(Boolean);
  const ranked = loadDocs()
    .map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id))
    .slice(0, limit);
  const primary = terms[0] || query.toLowerCase();
  return commandResult([], {
    mode: 'offline',
    query,
    count: ranked.length,
    results: ranked.map(({ doc, score }) => ({
      id: doc.id,
      path: doc.path,
      title: doc.title,
      score,
      excerpt: excerptAround(doc.text, primary),
    })),
  });
}

export function getExample(args: Record<string, unknown>): CommandResult {
  const id = argString(args, 'id');
  const kind = argString(args, 'kind');
  const query = argString(args, 'query').toLowerCase();
  const examples = loadExamples();
  if (id) {
    const match = examples.find((item) => item.id === id);
    if (!match) {
      return commandResult(
        [
          operationalIssue(
            'ADK-DISCOVERY',
            'error',
            `Unknown example ${id}`,
            'Pass kind or omit id to list examples.'
          ),
        ],
        { id }
      );
    }
    return commandResult([], {
      mode: 'offline',
      example: {
        id: match.id,
        kind: match.kind,
        title: match.title,
        summary: match.summary,
        snippet: match.snippet,
      },
    });
  }
  let filtered = examples;
  if (kind) filtered = filtered.filter((item) => item.kind === kind);
  if (query) {
    filtered = filtered.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query) ||
        item.summary.toLowerCase().includes(query) ||
        item.kind.toLowerCase().includes(query)
    );
  }
  if (kind && filtered.length === 1) {
    const [only] = filtered;
    if (only) {
      return commandResult([], {
        mode: 'offline',
        example: {
          id: only.id,
          kind: only.kind,
          title: only.title,
          summary: only.summary,
          snippet: only.snippet,
        },
      });
    }
  }
  return commandResult([], {
    mode: 'offline',
    count: filtered.length,
    examples: filtered.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
    })),
  });
}

