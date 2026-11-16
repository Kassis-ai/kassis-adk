import fs from 'node:fs';
import path from 'node:path';
import { addonDataSchemaName } from '@kassis/addon-sdk';
import type { AdkIssue, CommandResult } from './types.ts';
import {
  commandResult,
  failure,
  isRecordValue,
  kadkIssue,
  operationalIssue,
  readJson,
} from './issues.ts';
import { initProject } from './projectCommands.ts';

const NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KINDS = [
  'addon',
  'route',
  'capability',
  'event',
  'job',
  'migration',
  'ui-slot',
  'ui-page',
  'mcp-tool',
] as const;
type ScaffoldKind = (typeof KINDS)[number];

function isKind(value: string): value is ScaffoldKind {
  return KINDS.some((kind) => kind === value);
}

function pascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function camelFromKebab(name: string): string {
  const parts = name.split('-');
  return parts
    .map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

function loadManifest(
  dir: string
): { file: string; manifest: Record<string, unknown> } | CommandResult {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    return commandResult(
      [kadkIssue('KADK-102', 'manifest.json', null, { path: '', field: 'manifest.json' })],
      {}
    );
  }
  let parsed: unknown;
  try {
    parsed = readJson(file);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return commandResult(
      [
        kadkIssue('KADK-101', 'manifest.json', null, {
          path: 'manifest.json',
          detail: 'is not valid JSON',
        }),
      ],
      {}
    );
  }
  if (!isRecordValue(parsed) || typeof parsed.id !== 'string') {
    return failure('manifest.json needs an id', 'Set id before scaffold.');
  }
  return { file, manifest: parsed };
}

function writeManifest(file: string, manifest: Record<string, unknown>): void {
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function ensureArray(record: Record<string, unknown>, key: string): unknown[] {
  const current = record[key];
  if (Array.isArray(current)) return [...current];
  return [];
}

function ensureExpressDependency(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const parsed = readJson(pkgPath);
  if (!isRecordValue(parsed)) return false;
  const deps = isRecordValue(parsed.dependencies) ? { ...parsed.dependencies } : {};
  if (typeof deps.express === 'string') return false;
  deps.express = '^5.3.0';
  parsed.dependencies = deps;
  fs.writeFileSync(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function wireJobRegister(dir: string, name: string): string | null {
  const initFile = path.join(dir, 'src', 'server', 'index.ts');
  if (!fs.existsSync(initFile)) return null;
  const registerFn = `register${pascal(name)}`;
  const importLine = `import { ${registerFn} } from './jobs/${name}.js';`;
  let text = fs.readFileSync(initFile, 'utf8');
  if (text.includes(`${registerFn}(ctx)`)) return null;
  if (!text.includes(importLine)) {
    const sdkImport = "import type { AddonContext } from '@kassis/addon-sdk';";
    if (text.includes(sdkImport)) {
      text = text.replace(sdkImport, `${sdkImport}\n${importLine}`);
    } else {
      text = `${importLine}\n${text}`;
    }
  }
  const initMatch = /export async function initialize\(ctx: AddonContext\): Promise<void> \{/;
  if (!initMatch.test(text)) return null;
  text = text.replace(
    initMatch,
    `export async function initialize(ctx: AddonContext): Promise<void> {\n  ${registerFn}(ctx);`
  );
  fs.writeFileSync(initFile, text);
  return 'src/server/index.ts';
}

function jobFile(dir: string, id: string, name: string): string {
  const relative = path.join('src', 'server', 'jobs', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const jobType = `${id}.${name}`;
  const typeConst = `${camelFromKebab(name)}JobType`;
  const handlerFn = `handle${pascal(name)}`;
  const text = `import type { AddonContext, AddonJob, JsonValue } from '@kassis/addon-sdk';

export const ${typeConst} = '${jobType}' as const;

export async function ${handlerFn}(job: AddonJob): Promise<JsonValue> {
  return { ok: true, jobType: job.type, attempt: job.attempt };
}

export function register${pascal(name)}(ctx: AddonContext): void {
  ctx.jobs.register(${typeConst}, ${handlerFn});
}
`;
  fs.writeFileSync(target, text);
  return relative;
}

function wireRouteMount(dir: string, name: string): string | null {
  const initFile = path.join(dir, 'src', 'server', 'index.ts');
  if (!fs.existsSync(initFile)) return null;
  const mountFn = `mount${pascal(name)}`;
  const importLine = `import { ${mountFn} } from './routes/${name}.js';`;
  let text = fs.readFileSync(initFile, 'utf8');
  if (text.includes(`${mountFn}(ctx)`)) return null;
  if (!text.includes(importLine)) {
    const sdkImport = "import type { AddonContext } from '@kassis/addon-sdk';";
    if (text.includes(sdkImport)) {
      text = text.replace(sdkImport, `${sdkImport}\n${importLine}`);
    } else {
      text = `${importLine}\n${text}`;
    }
  }
  const initMatch = /export async function initialize\(ctx: AddonContext\): Promise<void> \{/;
  if (!initMatch.test(text)) return null;
  text = text.replace(
    initMatch,
    `export async function initialize(ctx: AddonContext): Promise<void> {\n  ${mountFn}(ctx);`
  );
  fs.writeFileSync(initFile, text);
  return 'src/server/index.ts';
}

function routeFile(dir: string, id: string, name: string): string {
  const relative = path.join('src', 'server', 'routes', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const permission = `${id}.${name}`;
  const routeConst = `${camelFromKebab(name)}Route`;
  const text = `import express from 'express';
import type { AddonContext, AddonRouter, RouteMountOptions } from '@kassis/addon-sdk';

export const ${routeConst}: RouteMountOptions = {
  permission: '${permission}',
  path: '/${name}',
};

export function create${pascal(name)}Router(): AddonRouter {
  const router = express.Router();
  router.get('/', (_req, res) => {
    res.status(200).json({ ok: true, route: '${name}' });
  });
  return router;
}

export function mount${pascal(name)}(ctx: AddonContext): void {
  ctx.routes.mount(create${pascal(name)}Router(), ${routeConst});
}
`;
  fs.writeFileSync(target, text);
  return relative;
}

function addPermission(manifest: Record<string, unknown>, permission: string): void {
  const permissions = ensureArray(manifest, 'permissions');
  const exists = permissions.some((item) => isRecordValue(item) && item.name === permission);
  if (!exists) permissions.push({ name: permission, displayName: permission });
  manifest.permissions = permissions;
}

function scaffoldRoute(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const permission = `${id}.${name}`;
  addPermission(loaded.manifest, permission);
  writeManifest(loaded.file, loaded.manifest);
  const addedExpress = ensureExpressDependency(dir);
  const file = routeFile(dir, id, name);
  const files = [file, 'manifest.json'];
  const initPatch = wireRouteMount(dir, name);
  if (initPatch) files.push(initPatch);
  if (addedExpress) files.push('package.json');
  return commandResult([], { kind: 'route', name: permission, files });
}

function scaffoldCapability(
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  let tier = 2;
  const rawTier = loaded.manifest.tier;
  if (typeof rawTier === 'number') tier = rawTier;
  else if (typeof rawTier === 'string') tier = Number(rawTier);
  if (tier === 2) {
    const id = String(loaded.manifest.id);
    return commandResult(
      [kadkIssue('KADK-218', 'manifest.json', null, { id, tier: '2' })],
      {}
    );
  }
  const capability = `${String(loaded.manifest.id)}.${name}`;
  const provides = ensureArray(loaded.manifest, 'provides');
  const exists = provides.some((item) => isRecordValue(item) && item.capability === capability);
  if (!exists) provides.push({ capability, version: '1.0.0' });
  loaded.manifest.provides = provides;
  writeManifest(loaded.file, loaded.manifest);
  return commandResult([], { kind: 'capability', name: capability, files: ['manifest.json'] });
}

function eventSchemaDocument(eventName: string): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    eventName,
    type: 'object',
    required: ['subjectId', 'summary'],
    properties: {
      subjectId: { type: 'string' },
      summary: { type: 'string' },
    },
    additionalProperties: true,
  };
}

function eventFile(dir: string, id: string, name: string): string {
  const relative = path.join('src', 'server', 'events', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const eventName = `${id}.${name}`;
  const eventConst = `${camelFromKebab(name)}EventName`;
  const payloadType = `${pascal(name)}EventPayload`;
  const publishFn = `publish${pascal(name)}`;
  const text = `import type { AddonContext, AddonPrincipal } from '@kassis/addon-sdk';

export const ${eventConst} = '${eventName}' as const;

export interface ${payloadType} {
  readonly subjectId: string;
  readonly summary: string;
}

export async function ${publishFn}(
  ctx: AddonContext,
  principal: AddonPrincipal,
  payload: ${payloadType}
): Promise<void> {
  await ctx.events.publish(principal, ${eventConst}, payload);
}
`;
  fs.writeFileSync(target, text);
  return relative;
}

function scaffoldEvent(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const eventName = `${id}.${name}`;
  const schema = `schemas/${name}.schema.json`;
  const events = isRecordValue(loaded.manifest.events) ? { ...loaded.manifest.events } : {};
  const publishes = Array.isArray(events.publishes) ? [...events.publishes] : [];
  const exists = publishes.some((item) => isRecordValue(item) && item.name === eventName);
  if (!exists) publishes.push({ name: eventName, schema });
  events.publishes = publishes;
  loaded.manifest.events = events;
  writeManifest(loaded.file, loaded.manifest);
  const schemaPath = path.join(dir, schema);
  if (!fs.existsSync(schemaPath)) {
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(
      schemaPath,
      `${JSON.stringify(eventSchemaDocument(eventName), null, 2)}\n`
    );
  }
  const file = eventFile(dir, id, name);
  return commandResult([], {
    kind: 'event',
    name: eventName,
    files: [file, 'manifest.json', schema],
  });
}

function scaffoldJob(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const job = `${id}.${name}`;
  const jobs = isRecordValue(loaded.manifest.jobs) ? { ...loaded.manifest.jobs } : {};
  const types = Array.isArray(jobs.types) ? [...jobs.types] : [];
  if (!types.includes(job)) types.push(job);
  jobs.types = types;
  loaded.manifest.jobs = jobs;
  writeManifest(loaded.file, loaded.manifest);
  const file = jobFile(dir, id, name);
  const files = [file, 'manifest.json'];
  const initPatch = wireJobRegister(dir, name);
  if (initPatch) files.push(initPatch);
  return commandResult([], { kind: 'job', name: job, files });
}

function ownedTableBaseName(addonId: string, name: string): string {
  return `${addonId.replace(/-/g, '_')}_${name.replace(/-/g, '_')}`;
}

function migrationUpSql(schema: string, table: string): string {
  return `-- Create owned table in the addon schema.
CREATE TABLE IF NOT EXISTS ${schema}.${table} (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;
}

function migrationDownSql(schema: string, table: string): string {
  return `-- Reverses the matching up script.
DROP TABLE IF EXISTS ${schema}.${table};
`;
}

function scaffoldMigration(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const schema = addonDataSchemaName(id);
  const table = ownedTableBaseName(id, name);
  const qualified = `${schema}.${table}`;

  const data = isRecordValue(loaded.manifest.data) ? { ...loaded.manifest.data } : {};
  if (typeof data.schema !== 'string') {
    data.schema = schema;
  }
  loaded.manifest.data = data;

  const database = isRecordValue(loaded.manifest.database) ? { ...loaded.manifest.database } : {};
  const ownedTables = Array.isArray(database.ownedTables) ? [...database.ownedTables] : [];
  if (!ownedTables.includes(qualified)) {
    ownedTables.push(qualified);
  }
  database.ownedTables = ownedTables;
  loaded.manifest.database = database;
  writeManifest(loaded.file, loaded.manifest);

  const folder = path.join(dir, 'migrations');
  fs.mkdirSync(folder, { recursive: true });
  const numbers = fs
    .readdirSync(folder)
    .map((entry) => /^(\d+)_/.exec(entry)?.[1])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => Number(entry));
  const next = String((numbers.length > 0 ? Math.max(...numbers) : 0) + 1).padStart(4, '0');
  const stem = `${next}_${name}`;
  const up = path.join(folder, `${stem}.up.sql`);
  const down = path.join(folder, `${stem}.down.sql`);
  if (!fs.existsSync(up)) fs.writeFileSync(up, migrationUpSql(schema, table));
  if (!fs.existsSync(down)) fs.writeFileSync(down, migrationDownSql(schema, table));

  const issues: AdkIssue[] = [];
  let tier = 2;
  const rawTier = loaded.manifest.tier;
  if (typeof rawTier === 'number') tier = rawTier;
  else if (typeof rawTier === 'string') tier = Number(rawTier);
  if (tier === 2) {
    issues.push(
      operationalIssue(
        'ADK-SCAFFOLD',
        'warning',
        'Tier 2 migrations do not run on install or update until host work S2.02 lands.',
        'Keep the SQL and manifest entries; deploy migration execution after S2.02.',
        'manifest.json'
      )
    );
  }

  return commandResult(issues, {
    kind: 'migration',
    name: stem,
    table: qualified,
    files: [
      path.join('migrations', `${stem}.up.sql`),
      path.join('migrations', `${stem}.down.sql`),
      'manifest.json',
    ],
  });
}

function titleFromKebab(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mergeLocalePages(
  dir: string,
  file: string,
  localeKey: string,
  labels: { readonly title: string; readonly body: string }
): string {
  const folder = path.dirname(file);
  fs.mkdirSync(folder, { recursive: true });
  let root: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    const parsed = readJson(file);
    if (isRecordValue(parsed)) root = { ...parsed };
  }
  const pages = isRecordValue(root.pages) ? { ...root.pages } : {};
  pages[localeKey] = labels;
  root.pages = pages;
  fs.writeFileSync(file, `${JSON.stringify(root, null, 2)}\n`);
  return path.relative(dir, file);
}

function uiLocaleFiles(dir: string, name: string): string[] {
  const localeKey = camelFromKebab(name);
  const title = titleFromKebab(name);
  const enFile = path.join(dir, 'src', 'ui', 'locales', 'en.json');
  const frFile = path.join(dir, 'src', 'ui', 'locales', 'fr.json');
  const enRel = mergeLocalePages(dir, enFile, localeKey, {
    title,
    body: 'Scaffolded UI slot page.',
  });
  const frRel = mergeLocalePages(dir, frFile, localeKey, {
    title: `Page « ${title} »`,
    body: "Page d'emplacement UI générée par le scaffold.",
  });
  return [enRel, frRel];
}

function uiPageFile(dir: string, addonId: string, name: string): string {
  const relative = path.join('src', 'ui', 'pages', `${name}.tsx`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const pageExport = `${pascal(name)}Page`;
  const localeKey = camelFromKebab(name);
  const text = `import type { JSX } from 'react';
import { useAddonTranslation } from '@kassis/host-sdk';

const ADDON_ID = '${addonId}' as const;

export function ${pageExport}(): JSX.Element {
  const { t } = useAddonTranslation(ADDON_ID);
  return (
    <section data-testid={\`\${ADDON_ID}-${name}-page\`}>
      <h1>{t('pages.${localeKey}.title')}</h1>
      <p>{t('pages.${localeKey}.body')}</p>
    </section>
  );
}
`;
  fs.writeFileSync(target, text);
  return relative;
}

function uiRenderTestFile(dir: string, addonId: string, name: string): string {
  const relative = path.join('test', 'ui', `${name}Page.render.test.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const localeKey = camelFromKebab(name);
  const text = `import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it } from 'node:test';
import en from '../../src/ui/locales/en.json' with { type: 'json' };

describe('${name} page render', () => {
  it('renders catalog strings from the en locale', () => {
    const pages = en.pages as Record<string, { title?: string; body?: string }> | undefined;
    const copy = pages?.${localeKey};
    assert.ok(copy?.title);
    const html = renderToString(
      createElement(
        'section',
        { 'data-testid': '${addonId}-${name}-page' },
        createElement('h1', null, copy.title),
        createElement('p', null, copy.body ?? '')
      )
    );
    assert.ok(html.includes(copy.title));
  });
});
`;
  fs.writeFileSync(target, text);
  return relative;
}

function ensureUiTestDependencies(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const parsed = readJson(pkgPath);
  if (!isRecordValue(parsed)) return false;
  const deps = isRecordValue(parsed.dependencies) ? { ...parsed.dependencies } : {};
  const devDeps = isRecordValue(parsed.devDependencies) ? { ...parsed.devDependencies } : {};
  let changed = false;
  const runtime: Record<string, string> = {
    react: '^19.3.1',
    'react-dom': '^19.3.1',
  };
  for (const [pkg, version] of Object.entries(runtime)) {
    if (typeof deps[pkg] !== 'string') {
      deps[pkg] = version;
      changed = true;
    }
  }
  if (typeof devDeps['@types/react'] !== 'string') {
    devDeps['@types/react'] = '^19.2.0';
    changed = true;
  }
  if (!changed) return false;
  parsed.dependencies = deps;
  parsed.devDependencies = devDeps;
  fs.writeFileSync(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function ensureUiTestRunnerScript(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const parsed = readJson(pkgPath);
  if (!isRecordValue(parsed) || !isRecordValue(parsed.scripts)) return false;
  const current = parsed.scripts.test;
  if (typeof current !== 'string' || current.includes('test/**/*.test')) return false;
  parsed.scripts = {
    ...parsed.scripts,
    test: 'node --experimental-strip-types --test "test/**/*.test.ts"',
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function wireUiIndex(dir: string, id: string, name: string): string | null {
  const initFile = path.join(dir, 'src', 'ui', 'index.ts');
  if (!fs.existsSync(initFile)) return null;
  const pageExport = `${pascal(name)}Page`;
  const importLine = `import { ${pageExport} } from './pages/${name}.js';`;
  const reactImport = "import type { ComponentType } from 'react';";
  const sdkImport = "import { registerAddonLocales } from '@kassis/host-sdk';";
  let text = fs.readFileSync(initFile, 'utf8');
  if (text.includes(`path: '/${id}/${name}'`)) return null;

  if (!text.includes(reactImport)) {
    text = `${reactImport}\n${text}`;
  }
  if (!text.includes(sdkImport)) {
    text = `${sdkImport}\n${text}`;
  }
  if (!text.includes(importLine)) {
    const routesMarker = 'export const routes';
    if (text.includes(routesMarker)) {
      text = text.replace(routesMarker, `${importLine}\n\nexport const routes`);
    } else {
      text = `${importLine}\n${text}`;
    }
  }
  if (!text.includes('readonly component:')) {
    text = text.replace(
      'readonly addon: { readonly name: string };',
      'readonly addon: { readonly name: string };\n  readonly component: ComponentType;'
    );
  }
  const routePath = `/${id}/${name}`;
  const routeBlock = `  {
    path: '${routePath}',
    component: ${pageExport},
    pageKey: '${id}-${name}',
    pageName: '${titleFromKebab(name)}',
    guard: { type: 'permission', permission: '${id}.view' },
    addon: { name: '${id}' },
  },`;
  const routesClose = /export const routes: readonly AddonRoute\[\] = \[/;
  if (routesClose.test(text)) {
    text = text.replace(routesClose, `export const routes: readonly AddonRoute[] = [\n${routeBlock}`);
  }
  const registerBody = /export function register\(\): void \{\n  \/\* Host extensions are registered here\. \*\/\n\}/;
  const registerReplacement = `export function register(): void {
  void registerAddonLocales('${id}', {
    en: () => import('./locales/en.json'),
    fr: () => import('./locales/fr.json'),
  });
}`;
  if (registerBody.test(text)) {
    text = text.replace(registerBody, registerReplacement);
  } else if (!text.includes(`registerAddonLocales('${id}'`)) {
    text = text.replace(
      /export function register\(\): void \{/,
      `export function register(): void {\n  void registerAddonLocales('${id}', {\n    en: () => import('./locales/en.json'),\n    fr: () => import('./locales/fr.json'),\n  });`
    );
  }
  fs.writeFileSync(initFile, text);
  return 'src/ui/index.ts';
}

function dependencyFileSpec(dir: string, packageFolder: string, fallback: string): string {
  const candidates = [
    path.resolve(dir, '../../packages', packageFolder),
    path.resolve(dir, '../../../packages', packageFolder),
  ];
  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
  if (!found) return fallback;
  const relative = path.relative(dir, found).split(path.sep).join('/');
  return `file:${relative.startsWith('.') ? relative : `./${relative}`}`;
}

function ensurePackageDependency(dir: string, packageName: string, version: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const parsed = readJson(pkgPath);
  if (!isRecordValue(parsed)) return false;
  const deps = isRecordValue(parsed.dependencies) ? { ...parsed.dependencies } : {};
  if (typeof deps[packageName] === 'string') return false;
  const folder = packageName.replace('@kassis/', '');
  deps[packageName] = dependencyFileSpec(dir, folder, version);
  parsed.dependencies = deps;
  fs.writeFileSync(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function mcpQualifiedToolName(addonId: string, name: string): string {
  return `${addonId}.${name}`;
}

function mcpToolFile(dir: string, addonId: string, name: string, viewPermission: string): string {
  const relative = path.join('src', 'mcp', 'tools', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const toolName = mcpQualifiedToolName(addonId, name);
  const exportName = camelFromKebab(name);
  const text = `import { defineMcpTool } from '@kassis/mcp-contract';

export const ${exportName} = defineMcpTool({
  name: '${toolName}',
  title: '${titleFromKebab(name)}',
  description: 'Scaffolded read-only MCP tool for ${addonId}.',
  input: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
  access: {
    anyOf: ['${viewPermission}'],
    mutating: false,
  },
  async handler() {
    return { summary: 'ok', data: { ok: true, tool: '${toolName}' } };
  },
});
`;
  fs.writeFileSync(target, text);
  return relative;
}

function wireMcpContribution(dir: string, addonId: string, name: string): string | null {
  const contributionFile = path.join(dir, 'src', 'mcp', 'contribution.ts');
  const exportName = camelFromKebab(name);
  const importLine = `import { ${exportName} } from './tools/${name}.js';`;
  let text = '';
  if (fs.existsSync(contributionFile)) {
    text = fs.readFileSync(contributionFile, 'utf8');
    const toolRef = new RegExp(`\\b${exportName}\\b`);
    if (toolRef.test(text) && text.includes('export const tools')) return null;
    if (!text.includes(importLine)) {
      text = `${importLine}\n${text}`;
    }
    const toolsOpen = 'export const tools = [';
    if (text.includes(toolsOpen)) {
      text = text.replace(toolsOpen, `${toolsOpen}\n  ${exportName},`);
    }
  } else {
    fs.mkdirSync(path.dirname(contributionFile), { recursive: true });
    text = `${importLine}

export const addonName = '${addonId}' as const;

export const tools = [${exportName}];
`;
  }
  fs.writeFileSync(contributionFile, text.endsWith('\n') ? text : `${text}\n`);
  return 'src/mcp/contribution.ts';
}

function mcpToolTestFile(dir: string, addonId: string, name: string): string {
  const relative = path.join('test', 'mcp', `${name}.mcp.test.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const exportName = camelFromKebab(name);
  const toolName = mcpQualifiedToolName(addonId, name);
  const text = `import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ${exportName} } from "../../src/mcp/tools/${name}.ts";

describe('${name} MCP tool', () => {
  it('returns ok from the scaffolded handler', async () => {
    const outcome = await ${exportName}.handler(
      {},
      {
        api: {
          get: async () => ({}),
          post: async () => ({}),
          put: async () => ({}),
          patch: async () => ({}),
          delete: async () => ({}),
        },
        principal: { id: 'test', kind: 'user', permissions: [] },
        paths: {
          api: (p: string) => p,
          addon: (id: string, p?: string) => \`\${id}/\${p ?? ''}\`,
        },
        log: {
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
        },
        audit: () => undefined,
      }
    );
    assert.ok(!('error' in outcome));
    assert.equal(outcome.summary, 'ok');
    assert.equal((outcome.data as { tool?: string } | undefined)?.tool, '${toolName}');
  });
});
`;
  fs.writeFileSync(target, text);
  return relative;
}

function ensureMcpTestRunnerScript(dir: string): boolean {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const parsed = readJson(pkgPath);
  if (!isRecordValue(parsed) || !isRecordValue(parsed.scripts)) return false;
  const current = parsed.scripts.test;
  if (typeof current !== 'string' || current.includes('test/**/*.test')) return false;
  parsed.scripts = {
    ...parsed.scripts,
    test: 'node --experimental-strip-types --test "test/**/*.test.ts"',
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(parsed, null, 2)}\n`);
  return true;
}

function scaffoldMcpTool(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const toolName = mcpQualifiedToolName(id, name);
  const viewPermission = `${id}.view`;
  addPermission(loaded.manifest, viewPermission);

  const contributions = isRecordValue(loaded.manifest.contributions)
    ? { ...loaded.manifest.contributions }
    : {};
  const mcp = isRecordValue(contributions.mcp) ? { ...contributions.mcp } : {};
  if (typeof mcp.entry !== 'string') {
    mcp.entry = 'dist/mcp/contribution.js';
  }
  const tools = Array.isArray(mcp.tools) ? [...mcp.tools] : [];
  if (!tools.includes(toolName)) tools.push(toolName);
  mcp.tools = tools;
  contributions.mcp = mcp;
  loaded.manifest.contributions = contributions;
  writeManifest(loaded.file, loaded.manifest);

  const files = ['manifest.json'];
  const toolFile = mcpToolFile(dir, id, name, viewPermission);
  files.push(toolFile);
  const contributionPatch = wireMcpContribution(dir, id, name);
  if (contributionPatch) files.push(contributionPatch);
  files.push(mcpToolTestFile(dir, id, name));
  let pkgChanged = ensurePackageDependency(dir, '@kassis/mcp-contract', '^0.1.0');
  if (ensureMcpTestRunnerScript(dir)) pkgChanged = true;
  if (pkgChanged) files.push('package.json');

  return commandResult([], { kind: 'mcp-tool', name: toolName, files });
}

function scaffoldUiContribution(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string,
  kind: 'ui-slot' | 'ui-page'
): CommandResult {
  if (!isRecordValue(loaded.manifest.ui)) {
    return failure(
      'This addon has no UI entry.',
      'Init with --rung=2 or --rung=3 before adding a UI slot.',
      'ADK-USAGE'
    );
  }
  const id = String(loaded.manifest.id);
  const ui = { ...loaded.manifest.ui };
  const contributions = isRecordValue(ui.contributions) ? { ...ui.contributions } : {};
  const nav = Array.isArray(contributions.nav) ? [...contributions.nav] : [];
  const href = `/${id}/${name}`;
  const exists = nav.some((item) => isRecordValue(item) && item.href === href);
  if (!exists) {
    nav.push({ section: 'addons', name, href, permission: `${id}.view` });
  }
  contributions.nav = nav;
  ui.contributions = contributions;
  loaded.manifest.ui = ui;
  writeManifest(loaded.file, loaded.manifest);

  const files = ['manifest.json'];
  const pageFile = uiPageFile(dir, id, name);
  files.push(pageFile);
  files.push(...uiLocaleFiles(dir, name));
  const testFile = uiRenderTestFile(dir, id, name);
  files.push(testFile);
  const indexPatch = wireUiIndex(dir, id, name);
  if (indexPatch) files.push(indexPatch);
  let pkgChanged = ensureUiTestDependencies(dir);
  if (ensureUiTestRunnerScript(dir)) pkgChanged = true;
  if (pkgChanged) files.push('package.json');

  return commandResult([], { kind, name, files });
}

function scaffoldSlot(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  return scaffoldUiContribution(dir, loaded, name, 'ui-slot');
}

function scaffoldUiPage(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  return scaffoldUiContribution(dir, loaded, name, 'ui-page');
}

export function scaffoldProject(input: {
  readonly dir: string;
  readonly kind: string;
  readonly id: string;
  readonly name: string;
  readonly publisher: string;
  readonly tier: string;
  readonly rung: string;
}): CommandResult {
  if (!isKind(input.kind)) {
    return failure(
      `scaffold kind must be one of ${KINDS.join(', ')}`,
      'Pass kind addon, route, capability, event, job, migration, ui-slot, ui-page, or mcp-tool.'
    );
  }
  if (input.kind === 'addon') {
    const dir = input.dir || (input.id ? path.resolve(input.id) : '');
    return initProject(input.id, dir, input.publisher, input.tier, input.rung);
  }
  if (!NAME_RE.test(input.name)) {
    return failure('scaffold --name must be kebab-case', 'Pass --name <kebab-case>.');
  }
  const loaded = loadManifest(input.dir);
  if ('ok' in loaded) return loaded;
  if (input.kind === 'route') return scaffoldRoute(input.dir, loaded, input.name);
  if (input.kind === 'capability') return scaffoldCapability(loaded, input.name);
  if (input.kind === 'event') return scaffoldEvent(input.dir, loaded, input.name);
  if (input.kind === 'job') return scaffoldJob(input.dir, loaded, input.name);
  if (input.kind === 'migration') return scaffoldMigration(input.dir, loaded, input.name);
  if (input.kind === 'ui-slot') return scaffoldSlot(input.dir, loaded, input.name);
  if (input.kind === 'ui-page') return scaffoldUiPage(input.dir, loaded, input.name);
  return scaffoldMcpTool(input.dir, loaded, input.name);
}
