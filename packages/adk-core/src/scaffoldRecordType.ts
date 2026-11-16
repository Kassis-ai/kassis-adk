import fs from 'node:fs';
import path from 'node:path';
import { addonDataSchemaName } from '@kassis/addon-sdk';
import type { CommandResult } from './types.ts';
import { commandResult, isRecordValue, readJson } from './issues.ts';

const WAVE1_EXTENDS = ['auditSubject', 'recordAccess', 'deletable'] as const;

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

function titleFromKebab(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Manifest resource type id: `<publisher-prefix>:<kebab-name>`. */
export function recordTypeQualifier(addonId: string, name: string): string {
  const hyphen = addonId.indexOf('-');
  if (hyphen > 0) return `${addonId.slice(0, hyphen)}:${name}`;
  return `${addonId}:${name}`;
}

function ensureArray(record: Record<string, unknown>, key: string): unknown[] {
  const current = record[key];
  if (Array.isArray(current)) return [...current];
  return [];
}

function ownedTableBaseName(addonId: string, name: string): string {
  return `${addonId.replace(/-/g, '_')}_${name.replace(/-/g, '_')}`;
}

function recordTypeFile(dir: string, addonId: string, name: string, qualified: string): string {
  const relative = path.join('src', 'server', 'record-types', `${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const exportName = `${camelFromKebab(name)}RecordType`;
  const subjectType = titleFromKebab(name);
  const text = `import { defineRecordType, type AddonPrincipal } from '@kassis/addon-sdk';

export const ${exportName} = defineRecordType({
  type: '${qualified}',
  sensitivity: 'standard',
  auditSubject: { subjectType: '${subjectType}', aliases: ['${name}'] },
  canAccess: async (_principal: AddonPrincipal, _recordId: string): Promise<boolean> => {
    throw new Error('${qualified} canAccess is not implemented');
  },
  onDelete: async (_principal: AddonPrincipal, _recordId: string): Promise<void> => {
    throw new Error('${qualified} onDelete is not implemented');
  },
});
`;
  fs.writeFileSync(target, text);
  return relative;
}

function registerRecordTypeFile(
  dir: string,
  addonId: string,
  name: string,
  qualified: string
): string {
  const relative = path.join('src', 'server', 'record-types', `register-${name}.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  const recordExport = `${camelFromKebab(name)}RecordType`;
  const registerFn = `register${pascal(name)}RecordType`;
  const subjectType = titleFromKebab(name);
  const table = ownedTableBaseName(addonId, name);
  const text = `import type { AddonContext } from '@kassis/addon-sdk';
import { ${recordExport} } from './${name}.js';

type Tier2RecordAccess = {
  registerRecordAccess(input: {
    resourceType: string;
    canAccess: typeof ${recordExport}.canAccess;
  }): { dispose(): Promise<void> };
};

export function ${registerFn}(ctx: AddonContext): void {
  const qualified = ${recordExport}.type;
  ctx.extend.registerAuditSubject({
    subjectType: '${subjectType}',
    aliases: ['${name}'],
    resourceType: qualified,
  } as Parameters<typeof ctx.extend.registerAuditSubject>[0] & { resourceType: string });
  (ctx.extend as Tier2RecordAccess).registerRecordAccess({
    resourceType: qualified,
    canAccess: ${recordExport}.canAccess,
  });
  ctx.extend.registerDeletable({
    ownerType: qualified,
    descriptor: {
      family: qualified,
      tableName: '${table}',
      prismaModel: '${table}',
      idCast: 'string',
      flagMode: 'deleted_at',
      eventDomain: '${subjectType.toUpperCase()}',
      permissionNamespace: '${addonId}',
      retentionFamily: '${name.replace(/-/g, '_')}',
    },
    onDelete: ${recordExport}.onDelete,
  } as Parameters<typeof ctx.extend.registerDeletable>[0] & {
    ownerType: string;
    onDelete: typeof ${recordExport}.onDelete;
  });
}
`;
  fs.writeFileSync(target, text);
  return relative;
}

function recordTypeTestFile(dir: string, addonId: string, name: string): string {
  const relative = path.join('test', 'server', `${name}RecordType.test.ts`);
  const target = path.join(dir, relative);
  if (fs.existsSync(target)) return relative;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const recordExport = `${camelFromKebab(name)}RecordType`;
  const viewPermission = `${addonId}.view`;
  const text = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { ${recordExport} } from '../../src/server/record-types/${name}.ts';

const addonRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(addonRoot, 'manifest.json'), 'utf8')
) as { data?: { retention?: string }; database?: { ownedTables?: string[] } };

const principal = {
  kind: 'user' as const,
  userId: 1,
  email: 'author@example.com',
  permissions: ['${viewPermission}'],
};

describe('${name} record type mandatory contract', () => {
  it('access: holders of the view permission can open a record', async () => {
    const allowed = await ${recordExport}.canAccess(principal, 'record-1');
    assert.equal(allowed, true);
  });

  it('delete: onDelete removes the record for an authorized principal', async () => {
    await ${recordExport}.onDelete(principal, 'record-1');
  });

  it('sensitivity: raise the seal level above the scaffold default', () => {
    assert.notEqual(
      ${recordExport}.sensitivity,
      'standard',
      'Set sensitivity on the record type and manifest resourceTypes entry'
    );
  });

  it('retention: confirm data.retention when this addon owns tables', () => {
    const owned = manifest.database?.ownedTables ?? [];
    if (owned.length === 0) {
      assert.fail(
        'Add a migration (or set database.ownedTables) and choose data.retention (retain, archive, or purge)'
      );
    }
    const retention = manifest.data?.retention;
    assert.ok(
      retention === 'retain' || retention === 'archive' || retention === 'purge',
      'data.retention must be retain, archive, or purge'
    );
    assert.notEqual(
      retention,
      'retain',
      'Replace the scaffold retain default if retain is not your uninstall policy'
    );
  });
});
`;
  fs.writeFileSync(target, text);
  return relative;
}

function ensureServerTestRunnerScript(dir: string): boolean {
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

function wireRecordTypeInIndex(dir: string, name: string): string | null {
  const initFile = path.join(dir, 'src', 'server', 'index.ts');
  if (!fs.existsSync(initFile)) return null;
  const registerFn = `register${pascal(name)}RecordType`;
  const recordExport = `${camelFromKebab(name)}RecordType`;
  const importRegister = `import { ${registerFn} } from './record-types/register-${name}.js';`;
  const importRecord = `import { ${recordExport} } from './record-types/${name}.js';`;
  let text = fs.readFileSync(initFile, 'utf8');
  if (text.includes(`${registerFn}(ctx)`)) return null;

  if (!text.includes(importRegister)) {
    const defineImport = "import { defineAddon";
    if (text.includes(defineImport)) {
      text = text.replace(
        defineImport,
        `${importRecord}\n${importRegister}\nimport { defineAddon`
      );
    } else {
      text = `${importRecord}\n${importRegister}\n${text}`;
    }
  }

  if (!text.includes(recordExport)) {
    if (!text.includes('recordTypes:')) {
      text = text.replace(
        /const addon = defineAddon\(\{\s*\n\s*async initialize/,
        `const addon = defineAddon({\n  recordTypes: [${recordExport}],\n  async initialize`
      );
    } else {
      text = text.replace(/recordTypes: \[/, `recordTypes: [${recordExport}, `);
    }
  }

  const initMatch = /export async function initialize\(ctx: AddonContext\): Promise<void> \{/;
  if (initMatch.test(text)) {
    text = text.replace(
      initMatch,
      `export async function initialize(ctx: AddonContext): Promise<void> {\n  ${registerFn}(ctx);`
    );
  } else {
    const bodyMatch =
      /(const addon = defineAddon\(\{\s*\n(?:\s*recordTypes: \[[^\]]*\],\s*\n)?\s*async initialize\(ctx[^)]*\): Promise<void> \{)\s*\n/;
    if (bodyMatch.test(text)) {
      text = text.replace(bodyMatch, `$1\n    ${registerFn}(ctx);\n`);
    }
  }

  fs.writeFileSync(initFile, text);
  return 'src/server/index.ts';
}

function addViewPermission(manifest: Record<string, unknown>, addonId: string): void {
  const permission = `${addonId}.view`;
  const permissions = ensureArray(manifest, 'permissions');
  const exists = permissions.some((item) => isRecordValue(item) && item.name === permission);
  if (!exists) permissions.push({ name: permission, displayName: `${addonId} view` });
  manifest.permissions = permissions;
}

export function scaffoldRecordType(
  dir: string,
  loaded: { file: string; manifest: Record<string, unknown> },
  name: string
): CommandResult {
  const id = String(loaded.manifest.id);
  const qualified = recordTypeQualifier(id, name);
  const label = titleFromKebab(name);

  const extendsList = ensureArray(loaded.manifest, 'extends');
  for (const point of WAVE1_EXTENDS) {
    if (!extendsList.includes(point)) extendsList.push(point);
  }
  loaded.manifest.extends = extendsList;

  const resourceTypes = ensureArray(loaded.manifest, 'resourceTypes');
  const hasType = resourceTypes.some(
    (item) => isRecordValue(item) && item.type === qualified
  );
  if (!hasType) {
    resourceTypes.push({
      type: qualified,
      label,
      abilities: { search: true, preview: true, linkToCase: true },
      sensitivity: 'standard',
      viewPermissions: [`${id}.view`],
    });
  }
  loaded.manifest.resourceTypes = resourceTypes;

  const data = isRecordValue(loaded.manifest.data) ? { ...loaded.manifest.data } : {};
  if (typeof data.schema !== 'string') {
    data.schema = addonDataSchemaName(id);
  }
  if (typeof data.retention !== 'string') {
    data.retention = 'retain';
  }
  loaded.manifest.data = data;
  addViewPermission(loaded.manifest, id);

  fs.writeFileSync(loaded.file, `${JSON.stringify(loaded.manifest, null, 2)}\n`);

  const files = [
    recordTypeFile(dir, id, name, qualified),
    registerRecordTypeFile(dir, id, name, qualified),
    recordTypeTestFile(dir, id, name),
    'manifest.json',
  ];
  const indexPatch = wireRecordTypeInIndex(dir, name);
  if (indexPatch) files.push(indexPatch);
  if (ensureServerTestRunnerScript(dir)) files.push('package.json');

  return commandResult([], { kind: 'record-type', name: qualified, files });
}