import fs from 'node:fs';
import path from 'node:path';
import type { CommandResult } from './types.ts';
import { commandResult, failure, isRecordValue, kadkIssue, readJson } from './issues.ts';
import { initProject } from './projectCommands.ts';

const NAME_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const KINDS = ['addon', 'route', 'capability', 'event', 'job', 'migration', 'ui-slot'] as const;
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

function loadManifest(dir: string): { file: string; manifest: Record<string, unknown> } | CommandResult {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    return commandResult([kadkIssue('KADK-102', 'manifest.json', null, { path: '', field: 'manifest.json' })], {});
  }
  let parsed: unknown;
  try {
    parsed = readJson(file);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return commandResult(
      [kadkIssue('KADK-101', 'manifest.json', null, { path: 'manifest.json', detail: 'is not valid JSON' })],
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

function routeFile(dir: string, id: string, name: string): string {
  const relative = path.join('src', 'server', 'routes', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const permission = `${id}.${name}`;
  const text = `import type { AddonContext, AddonRouter, RouteMountOptions } from '@kassis/addon-sdk';

export const ${name.replace(/-/g, '_')}Route: RouteMountOptions = {
  permission: '${permission}',
  path: '/${name}',
};

export function mount${pascal(name)}(ctx: AddonContext): void {
  const handler: AddonRouter = (() => undefined) as AddonRouter;
  ctx.routes.mount(handler, ${name.replace(/-/g, '_')}Route);
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

function scaffoldRoute(dir: string, loaded: { file: string; manifest: Record<string, unknown> }, name: string): CommandResult {
  const id = String(loaded.manifest.id);
  const permission = `${id}.${name}`;
  addPermission(loaded.manifest, permission);
  writeManifest(loaded.file, loaded.manifest);
  const file = routeFile(dir, id, name);
  return commandResult([], { kind: 'route', name: permission, files: [file, 'manifest.json'] });
}

function scaffoldCapability(loaded: { file: string; manifest: Record<string, unknown> }, name: string): CommandResult {
  const capability = `${String(loaded.manifest.id)}.${name}`;
  const provides = ensureArray(loaded.manifest, 'provides');
  const exists = provides.some((item) => isRecordValue(item) && item.capability === capability);
  if (!exists) provides.push({ capability, version: '1.0.0' });
  loaded.manifest.provides = provides;
  writeManifest(loaded.file, loaded.manifest);
  return commandResult([], { kind: 'capability', name: capability, files: ['manifest.json'] });
}

function scaffoldEvent(dir: string, loaded: { file: string; manifest: Record<string, unknown> }, name: string): CommandResult {
  const eventName = `${String(loaded.manifest.id)}.${name}`;
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
    fs.writeFileSync(schemaPath, `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object' }, null, 2)}\n`);
  }
  return commandResult([], { kind: 'event', name: eventName, files: ['manifest.json', schema] });
}

function scaffoldJob(loaded: { file: string; manifest: Record<string, unknown> }, name: string): CommandResult {
  const job = `${String(loaded.manifest.id)}.${name}`;
  const jobs = isRecordValue(loaded.manifest.jobs) ? { ...loaded.manifest.jobs } : {};
  const types = Array.isArray(jobs.types) ? [...jobs.types] : [];
  if (!types.includes(job)) types.push(job);
  jobs.types = types;
  loaded.manifest.jobs = jobs;
  writeManifest(loaded.file, loaded.manifest);
  return commandResult([], { kind: 'job', name: job, files: ['manifest.json'] });
}

function scaffoldMigration(dir: string, name: string): CommandResult {
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
  if (!fs.existsSync(up)) fs.writeFileSync(up, `-- ${stem}\n`);
  if (!fs.existsSync(down)) fs.writeFileSync(down, `-- Reverses ${stem}.up.sql.\n`);
  return commandResult([], {
    kind: 'migration',
    name: stem,
    files: [path.join('migrations', `${stem}.up.sql`), path.join('migrations', `${stem}.down.sql`)],
  });
}

function scaffoldSlot(loaded: { file: string; manifest: Record<string, unknown> }, name: string): CommandResult {
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
  return commandResult([], { kind: 'ui-slot', name, files: ['manifest.json'] });
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
    return failure(`scaffold kind must be one of ${KINDS.join(', ')}`, 'Pass kind addon, route, capability, event, job, migration, or ui-slot.');
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
  if (input.kind === 'job') return scaffoldJob(loaded, input.name);
  if (input.kind === 'migration') return scaffoldMigration(input.dir, input.name);
  return scaffoldSlot(loaded, input.name);
}
