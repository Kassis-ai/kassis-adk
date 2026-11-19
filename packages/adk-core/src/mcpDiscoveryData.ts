/**
 * Packaged discovery catalogs for offline ADK MCP tools (S2.38).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { JsonObject } from './types.ts';
import { isRecordValue, packedCli } from './issues.ts';

const require = createRequire(import.meta.url);

export interface TierMatrixRow {
  readonly method: string;
  readonly tier1: boolean;
  readonly tier2: boolean;
  readonly permission: string | null;
  readonly availability?: string;
  readonly note?: string;
}

export interface ExtensionPoint {
  readonly id: string;
  readonly method: string;
  readonly manifestExtendsId: string | null;
  readonly summary: string;
  readonly note?: string;
}

export interface PlatformEvent {
  readonly name: string;
  readonly source: string;
  readonly schema: JsonObject;
}

export interface DiscoveryExample {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly snippet: string;
}

export interface DocEntry {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly text: string;
}

export interface CoreFeatureMapEntry {
  readonly id: string;
  readonly need: string;
  readonly aliases: readonly string[];
  readonly coreFeature: string;
  readonly facade: string | null;
  readonly extensionPoint: string | null;
  readonly summary: string;
  readonly example: string;
  readonly doNot?: string;
  readonly note?: string;
}

export interface GuardrailCatalogRow {
  readonly id: string;
  readonly group: string;
  readonly level: string;
  readonly check: string;
  readonly kadkCode: string;
  readonly fixHint: string;
  readonly inProfile?: boolean;
}

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function discoveryDir(): string {
  return path.join(moduleDir(), 'discovery');
}

function clientDocsDir(): string {
  if (packedCli()) return path.join(moduleDir(), 'client-docs');
  return path.join(discoveryDir(), '..', 'client-docs');
}

function readBundledDocText(id: string, indexText: string): string {
  const bundled = path.join(clientDocsDir(), `${id}.md`);
  try {
    if (fs.existsSync(bundled)) {
      return fs.readFileSync(bundled, 'utf8');
    }
  } catch {
    // fall through to index excerpt
  }
  return indexText;
}

function tierMatrixPath(): string {
  if (packedCli()) return path.join(moduleDir(), 'tier-matrix.json');
  return require.resolve('@kassis/addon-sdk/tier-matrix.json');
}

function guardrailsCatalogPath(): string {
  if (packedCli()) return path.join(moduleDir(), 'guardrails.json');
  return require.resolve('@kassis/addon-sdk/guardrails.json');
}

function readDiscoveryJson(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(discoveryDir(), name), 'utf8')) as unknown;
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export function loadGuardrailCatalogRows(): readonly GuardrailCatalogRow[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(guardrailsCatalogPath(), 'utf8'));
  if (!isRecordValue(parsed) || !Array.isArray(parsed.entries)) return [];
  const rows: GuardrailCatalogRow[] = [];
  for (const item of parsed.entries) {
    if (!isRecordValue(item) || typeof item.id !== 'string') continue;
    if (typeof item.group !== 'string' || typeof item.level !== 'string') continue;
    if (typeof item.kadkCode !== 'string' || typeof item.fixHint !== 'string') continue;
    const check =
      typeof item.check === 'string'
        ? item.check
        : Array.isArray(item.check) && item.check.every((part) => typeof part === 'string')
          ? item.check.join(', ')
          : '';
    if (check.length === 0) continue;
    rows.push({
      id: item.id,
      group: item.group,
      level: item.level,
      check,
      kadkCode: item.kadkCode,
      fixHint: item.fixHint,
      ...(item.inProfile === true ? { inProfile: true } : {}),
    });
  }
  return rows;
}

export function loadTierMatrixRows(): readonly TierMatrixRow[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(tierMatrixPath(), 'utf8'));
  if (!isRecordValue(parsed) || !Array.isArray(parsed.methods)) return [];
  const rows: TierMatrixRow[] = [];
  for (const item of parsed.methods) {
    if (!isRecordValue(item) || typeof item.method !== 'string') continue;
    if (typeof item.tier1 !== 'boolean' || typeof item.tier2 !== 'boolean') continue;
    const permission =
      item.permission === null || typeof item.permission === 'string' ? item.permission : null;
    rows.push({
      method: item.method,
      tier1: item.tier1,
      tier2: item.tier2,
      permission,
      ...(typeof item.availability === 'string' ? { availability: item.availability } : {}),
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    });
  }
  return rows;
}

export function loadExtensionPoints(): readonly ExtensionPoint[] {
  const parsed = readDiscoveryJson('extension-points.json');
  if (!isRecordValue(parsed) || !Array.isArray(parsed.points)) return [];
  const points: ExtensionPoint[] = [];
  for (const item of parsed.points) {
    if (!isRecordValue(item)) continue;
    if (typeof item.id !== 'string' || typeof item.method !== 'string') continue;
    if (typeof item.summary !== 'string') continue;
    const manifestExtendsId =
      item.manifestExtendsId === null || typeof item.manifestExtendsId === 'string'
        ? item.manifestExtendsId
        : null;
    points.push({
      id: item.id,
      method: item.method,
      manifestExtendsId,
      summary: item.summary,
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    });
  }
  return points;
}

export function loadPlatformEvents(): readonly PlatformEvent[] {
  const parsed = readDiscoveryJson('platform-events.json');
  if (!isRecordValue(parsed) || !Array.isArray(parsed.events)) return [];
  const events: PlatformEvent[] = [];
  for (const item of parsed.events) {
    if (!isRecordValue(item) || typeof item.name !== 'string') continue;
    if (!isRecordValue(item.schema)) continue;
    events.push({
      name: item.name,
      source: typeof item.source === 'string' ? item.source : 'platform',
      schema: toJsonObject(item.schema),
    });
  }
  return events;
}

export function loadExamples(): readonly DiscoveryExample[] {
  const parsed = readDiscoveryJson('examples.json');
  if (!isRecordValue(parsed) || !Array.isArray(parsed.examples)) return [];
  const examples: DiscoveryExample[] = [];
  for (const item of parsed.examples) {
    if (!isRecordValue(item)) continue;
    if (typeof item.id !== 'string' || typeof item.kind !== 'string') continue;
    if (typeof item.title !== 'string' || typeof item.summary !== 'string') continue;
    if (typeof item.snippet !== 'string') continue;
    examples.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      snippet: item.snippet,
    });
  }
  return examples;
}

export function loadDocs(): readonly DocEntry[] {
  const parsed = readDiscoveryJson('docs-index.json');
  if (!isRecordValue(parsed) || !Array.isArray(parsed.documents)) return [];
  const docs: DocEntry[] = [];
  for (const item of parsed.documents) {
    if (!isRecordValue(item)) continue;
    if (typeof item.id !== 'string' || typeof item.path !== 'string') continue;
    if (typeof item.title !== 'string' || typeof item.text !== 'string') continue;
    docs.push({
      id: item.id,
      path: item.path,
      title: item.title,
      text: readBundledDocText(item.id, item.text),
    });
  }
  return docs;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function loadCoreFeatures(): readonly CoreFeatureMapEntry[] {
  const parsed = readDiscoveryJson('core-features.json');
  if (!isRecordValue(parsed) || !Array.isArray(parsed.features)) return [];
  const features: CoreFeatureMapEntry[] = [];
  for (const item of parsed.features) {
    if (!isRecordValue(item)) continue;
    if (typeof item.id !== 'string' || typeof item.need !== 'string') continue;
    if (typeof item.coreFeature !== 'string' || typeof item.summary !== 'string') continue;
    if (typeof item.example !== 'string') continue;
    const facade =
      item.facade === null || typeof item.facade === 'string' ? item.facade : null;
    const extensionPoint =
      item.extensionPoint === null || typeof item.extensionPoint === 'string'
        ? item.extensionPoint
        : null;
    features.push({
      id: item.id,
      need: item.need,
      aliases: stringList(item.aliases),
      coreFeature: item.coreFeature,
      facade,
      extensionPoint,
      summary: item.summary,
      example: item.example,
      ...(typeof item.doNot === 'string' ? { doNot: item.doNot } : {}),
      ...(typeof item.note === 'string' ? { note: item.note } : {}),
    });
  }
  return features;
}

export function facadeArea(method: string): string {
  const parts = method.split('.');
  if (parts.length >= 3 && parts[1] === 'core') return `ctx.core.${parts[2]}`;
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return method;
}

export function rowToJson(row: TierMatrixRow): JsonObject {
  return {
    method: row.method,
    tier1: row.tier1,
    tier2: row.tier2,
    permission: row.permission,
    ...(row.availability ? { availability: row.availability } : {}),
    ...(row.note ? { note: row.note } : {}),
  };
}

export function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}
