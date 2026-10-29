import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AdkIssue, CommandResult, IssueSeverity, JsonObject } from './types.ts';

declare global {
  var __KASSIS_ADK_PACKED__: boolean | undefined;
}

interface CatalogEntry {
  readonly code: string;
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly fix: string;
}

function moduleDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/** True only inside the esbuild bundle written by addon-cli prepack. */
export function packedCli(): boolean {
  return globalThis.__KASSIS_ADK_PACKED__ === true;
}

function catalogPath(): string {
  const here = moduleDir();
  if (packedCli()) return path.join(here, 'kadk-codes.json');
  return path.resolve(here, '../../addon-sdk/codes/kadk-codes.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSeverity(value: unknown): value is IssueSeverity {
  return value === 'error' || value === 'warning';
}

function loadCatalog(): ReadonlyMap<string, CatalogEntry> {
  const parsed: unknown = JSON.parse(fs.readFileSync(catalogPath(), 'utf8'));
  if (!isRecord(parsed) || !Array.isArray(parsed.codes)) {
    throw new Error('kadk-codes.json is missing its codes array');
  }
  const entries = new Map<string, CatalogEntry>();
  for (const item of parsed.codes) {
    if (!isRecord(item) || typeof item.code !== 'string' || !isSeverity(item.severity)) continue;
    if (typeof item.message !== 'string' || typeof item.fix !== 'string') continue;
    entries.set(item.code, {
      code: item.code,
      severity: item.severity,
      message: item.message,
      fix: item.fix,
    });
  }
  return entries;
}

const catalog = loadCatalog();

export function repoRoot(): string {
  const here = moduleDir();
  if (packedCli()) return path.resolve(here, '..');
  return path.resolve(here, '../../..');
}

function readCliPackageVersion(file: string): string {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (isRecord(parsed) && parsed.name === '@kassis/addon-cli' && typeof parsed.version === 'string') {
      return parsed.version;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
  }
  return '';
}

export function cliVersion(): string {
  const home = repoRoot();
  const direct = readCliPackageVersion(path.join(home, 'package.json'));
  if (direct) return direct;
  if (globalThis.__KASSIS_ADK_PACKED__ === true) return '0.0.0';
  return readCliPackageVersion(path.join(home, 'packages/addon-cli/package.json')) || '0.0.0';
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (_match, name: string) =>
    values[name] === undefined ? `{${name}}` : values[name]
  );
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, '//***@')
    .replace(/\b(ghp_|github_pat_|npm_)[A-Za-z0-9_]+\b/g, '***');
}

export function kadkIssue(
  code: string,
  file: string,
  line: number | null,
  values: Readonly<Record<string, string>> = {}
): AdkIssue {
  const entry = catalog.get(code);
  if (!entry) {
    return operationalIssue('ADK-CODE', 'error', `Unknown code ${code}`, 'Use a code from kadk-codes.json.', file, line);
  }
  const pathValue = values.path || 'manifest';
  const filledValues = { ...values, path: pathValue };
  return {
    code,
    severity: entry.severity,
    message: fill(entry.message, filledValues),
    fix: fill(entry.fix, filledValues),
    file,
    line,
  };
}

export function operationalIssue(
  code: string,
  severity: IssueSeverity,
  message: string,
  fix: string,
  file = '',
  line: number | null = null
): AdkIssue {
  return { code, severity, message, fix, file, line };
}

export function commandResult(issues: readonly AdkIssue[], data: JsonObject = {}): CommandResult {
  return { ok: issues.every((issue) => issue.severity !== 'error'), issues, data };
}

export function failure(message: string, fix: string, code = 'ADK-USAGE', data: JsonObject = {}): CommandResult {
  return commandResult([operationalIssue(code, 'error', message, fix)], data);
}
