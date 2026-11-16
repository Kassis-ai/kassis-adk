/**
 * Manifest v2 rules a JSON Schema cannot express: names in the addon namespace, no duplicates,
 * tier 2 data limits, package paths. Each rule reads the manifest defensively, so it can run on
 * a manifest that also failed the schema and every problem is reported in one pass.
 */
import { createKadkIssue, type KadkCode, type KadkIssue } from '../codes/kadkCodes.js';

/** An untrusted manifest object; values are narrowed before use. */
type ManifestRecord = Readonly<Record<string, unknown>>;

type Entry<T> = { readonly value: T; readonly path: string };

export interface ManifestValidationOptions {
  /** Namespaces the host reserves for core (from its permission catalog). The id must not use one. */
  readonly reservedNamespaces?: readonly string[];
}

const PACKAGE_PATH_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['entrypoints', 'main'],
  ['contributions.mcp', 'entry'],
  ['ui', 'entryFile'],
];

/** `ubo-panel` → `['ubo-panel.', 'ubo_panel.']`, the prefixes 0b accepts for published names. */
export function addonNamespacePrefixes(addonId: string): string[] {
  return [...new Set([`${addonId}.`, `${addonId.replace(/-/g, '_')}.`])];
}

/** Slug prefixes for manifest `groups[].name` (dotted or hyphenated). */
export function addonGroupNamespacePrefixes(addonId: string): string[] {
  const underscored = addonId.replace(/-/g, '_');
  return [...new Set([`${addonId}.`, `${underscored}.`, `${addonId}-`, `${underscored}-`])];
}

/** `ubo-panel` → `addon_ubo_panel`, the Postgres schema and role of the addon. */
export function addonDataSchemaName(addonId: string): string {
  return `addon_${addonId.replace(/-/g, '_')}`;
}

function isRecord(value: unknown): value is ManifestRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordAt(source: ManifestRecord, dottedKey: string): ManifestRecord {
  let current: unknown = source;
  for (const key of dottedKey.split('.')) {
    current = isRecord(current) ? current[key] : undefined;
  }
  return isRecord(current) ? current : {};
}

function stringsAt(source: ManifestRecord, key: string, basePath: string): Entry<string>[] {
  const list = source[key];
  if (!Array.isArray(list)) return [];
  return list.flatMap((value: unknown, index) =>
    typeof value === 'string' ? [{ value, path: `${basePath}[${index}]` }] : []
  );
}

function fieldsAt(
  source: ManifestRecord,
  key: string,
  field: string,
  basePath: string
): Entry<string>[] {
  const list = source[key];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown, index) => {
    const value = isRecord(item) ? item[field] : undefined;
    return typeof value === 'string' ? [{ value, path: `${basePath}[${index}].${field}` }] : [];
  });
}

function hasKey(source: ManifestRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function checkReservedId(id: string, options: ManifestValidationOptions): KadkIssue[] {
  const candidates = new Set([id, id.replace(/-/g, '_')]);
  const namespace = (options.reservedNamespaces ?? []).find((reserved) => candidates.has(reserved));
  return namespace ? [createKadkIssue('KADK-109', 'id', { id, namespace })] : [];
}

function namespaceIssues(
  code: KadkCode,
  entries: Entry<string>[],
  prefixes: string[]
): KadkIssue[] {
  const label = prefixes.map((prefix) => `'${prefix}'`).join(' or ');
  return entries
    .filter((entry) => !prefixes.some((prefix) => entry.value.startsWith(prefix)))
    .map((entry) => createKadkIssue(code, entry.path, { value: entry.value, prefixes: label }));
}

function checkNamespaces(manifest: ManifestRecord, id: string): KadkIssue[] {
  const dotted = addonNamespacePrefixes(id);
  return [
    ...namespaceIssues(
      'KADK-110',
      fieldsAt(manifest, 'permissions', 'name', 'permissions'),
      dotted
    ),
    ...namespaceIssues(
      'KADK-111',
      stringsAt(recordAt(manifest, 'jobs'), 'types', 'jobs.types'),
      dotted
    ),
    ...namespaceIssues(
      'KADK-112',
      stringsAt(recordAt(manifest, 'prompts'), 'keys', 'prompts.keys'),
      dotted
    ),
    ...namespaceIssues(
      'KADK-113',
      stringsAt(recordAt(manifest, 'secrets'), 'keys', 'secrets.keys'),
      [`${id}:`]
    ),
    ...namespaceIssues(
      'KADK-114',
      fieldsAt(recordAt(manifest, 'events'), 'publishes', 'name', 'events.publishes'),
      dotted
    ),
    ...namespaceIssues(
      'KADK-115',
      stringsAt(recordAt(manifest, 'audit'), 'actions', 'audit.actions'),
      dotted
    ),
    ...namespaceIssues(
      'KADK-122',
      fieldsAt(manifest, 'groups', 'name', 'groups'),
      addonGroupNamespacePrefixes(id)
    ),
  ];
}

function duplicateIssues(entries: Entry<string>[], listPath: string): KadkIssue[] {
  const seen = new Set<string>();
  const issues: KadkIssue[] = [];
  for (const entry of entries) {
    if (seen.has(entry.value)) {
      issues.push(createKadkIssue('KADK-116', listPath, { value: entry.value }));
    }
    seen.add(entry.value);
  }
  return issues;
}

function groupPermissionEntries(manifest: ManifestRecord): Entry<string>[] {
  const list = manifest['groups'];
  if (!Array.isArray(list)) return [];
  return list.flatMap((item: unknown, index) => {
    if (!isRecord(item)) return [];
    const permissions = item['permissions'];
    if (!Array.isArray(permissions)) return [];
    return permissions.flatMap((value: unknown, permIndex) =>
      typeof value === 'string'
        ? [{ value, path: `groups[${index}].permissions[${permIndex}]` }]
        : []
    );
  });
}

function slotKeys(manifest: ManifestRecord): Entry<string>[] {
  const slots = recordAt(manifest, 'ui')['slots'];
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((item: unknown, index) =>
    isRecord(item) && typeof item['slot'] === 'string' && typeof item['component'] === 'string'
      ? [{ value: `${item['slot']}:${item['component']}`, path: `ui.slots[${index}]` }]
      : []
  );
}

function checkDuplicates(manifest: ManifestRecord): KadkIssue[] {
  const events = recordAt(manifest, 'events');
  const database = recordAt(manifest, 'database');
  const lists: Array<readonly [Entry<string>[], string]> = [
    [fieldsAt(manifest, 'permissions', 'name', 'permissions'), 'permissions'],
    [fieldsAt(manifest, 'groups', 'name', 'groups'), 'groups'],
    [groupPermissionEntries(manifest), 'groups'],
    [stringsAt(manifest, 'requiredPermissions', 'requiredPermissions'), 'requiredPermissions'],
    [fieldsAt(manifest, 'requires', 'capability', 'requires'), 'requires'],
    [fieldsAt(manifest, 'optional', 'capability', 'optional'), 'optional'],
    [fieldsAt(manifest, 'provides', 'capability', 'provides'), 'provides'],
    [fieldsAt(events, 'publishes', 'name', 'events.publishes'), 'events.publishes'],
    [stringsAt(events, 'subscribes', 'events.subscribes'), 'events.subscribes'],
    [stringsAt(recordAt(manifest, 'audit'), 'actions', 'audit.actions'), 'audit.actions'],
    [stringsAt(recordAt(manifest, 'egress'), 'hosts', 'egress.hosts'), 'egress.hosts'],
    [stringsAt(recordAt(manifest, 'jobs'), 'types', 'jobs.types'), 'jobs.types'],
    [stringsAt(recordAt(manifest, 'prompts'), 'keys', 'prompts.keys'), 'prompts.keys'],
    [stringsAt(recordAt(manifest, 'secrets'), 'keys', 'secrets.keys'), 'secrets.keys'],
    [stringsAt(database, 'ownedTables', 'database.ownedTables'), 'database.ownedTables'],
    [stringsAt(database, 'readAccess', 'database.readAccess'), 'database.readAccess'],
    [fieldsAt(manifest, 'legacyTables', 'tableName', 'legacyTables'), 'legacyTables'],
    [
      stringsAt(recordAt(manifest, 'contributions.mcp'), 'tools', 'contributions.mcp.tools'),
      'contributions.mcp.tools',
    ],
    [fieldsAt(manifest, 'resourceTypes', 'type', 'resourceTypes'), 'resourceTypes'],
    [slotKeys(manifest), 'ui.slots'],
  ];
  return lists.flatMap(([entries, listPath]) => duplicateIssues(entries, listPath));
}

function checkCapabilityOverlap(manifest: ManifestRecord): KadkIssue[] {
  const required = new Set(
    fieldsAt(manifest, 'requires', 'capability', 'requires').map((entry) => entry.value)
  );
  return fieldsAt(manifest, 'optional', 'capability', 'optional')
    .filter((entry) => required.has(entry.value))
    .map((entry) => createKadkIssue('KADK-117', entry.path, { value: entry.value }));
}

function checkRequiredPermissions(manifest: ManifestRecord): KadkIssue[] {
  const declared = new Set(
    fieldsAt(manifest, 'permissions', 'name', 'permissions').map((entry) => entry.value)
  );
  return stringsAt(manifest, 'requiredPermissions', 'requiredPermissions')
    .filter((entry) => !declared.has(entry.value))
    .map((entry) => createKadkIssue('KADK-118', entry.path, { value: entry.value }));
}

function checkGroupPermissions(manifest: ManifestRecord): KadkIssue[] {
  const declared = new Set(
    fieldsAt(manifest, 'permissions', 'name', 'permissions').map((entry) => entry.value)
  );
  return groupPermissionEntries(manifest)
    .filter((entry) => !declared.has(entry.value))
    .map((entry) => createKadkIssue('KADK-123', entry.path, { value: entry.value }));
}

function leavesPackage(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((segment) => segment === '..')
  );
}

function packagePaths(manifest: ManifestRecord): Entry<string>[] {
  const direct = PACKAGE_PATH_FIELDS.flatMap(([parent, key]) => {
    const value = recordAt(manifest, parent)[key];
    return typeof value === 'string' ? [{ value, path: `${parent}.${key}` }] : [];
  });
  return [
    ...direct,
    ...fieldsAt(recordAt(manifest, 'events'), 'publishes', 'schema', 'events.publishes'),
  ];
}

function checkPackagePaths(manifest: ManifestRecord): KadkIssue[] {
  return packagePaths(manifest)
    .filter((entry) => leavesPackage(entry.value))
    .map((entry) => createKadkIssue('KADK-120', entry.path, { value: entry.value }));
}

function checkEventSchemaFiles(manifest: ManifestRecord): KadkIssue[] {
  return fieldsAt(recordAt(manifest, 'events'), 'publishes', 'schema', 'events.publishes')
    .filter((entry) => !entry.value.endsWith('.schema.json'))
    .map((entry) => createKadkIssue('KADK-406', entry.path, { value: entry.value }));
}

function checkRuntimeLoadedUi(manifest: ManifestRecord): KadkIssue[] {
  const ui = recordAt(manifest, 'ui');
  const entryFile = ui['entryFile'];
  const hasEntry = typeof entryFile === 'string' && entryFile.length > 0;
  return ui['runtimeLoad'] === true && !hasEntry
    ? [createKadkIssue('KADK-501', 'ui.entryFile')]
    : [];
}

function checkDataSchemaName(manifest: ManifestRecord, id: string): KadkIssue[] {
  const schema = recordAt(manifest, 'data')['schema'];
  const expected = addonDataSchemaName(id);
  return typeof schema === 'string' && schema !== expected
    ? [createKadkIssue('KADK-304', 'data.schema', { value: schema, expected })]
    : [];
}

/** Required when the addon declares any owned table (tier 1 or 2). */
function checkDataRetention(manifest: ManifestRecord): KadkIssue[] {
  const owned = stringsAt(recordAt(manifest, 'database'), 'ownedTables', 'database.ownedTables');
  if (owned.length === 0) return [];
  const retention = recordAt(manifest, 'data')['retention'];
  return typeof retention === 'string' &&
    (retention === 'retain' || retention === 'archive' || retention === 'purge')
    ? []
    : [createKadkIssue('KADK-309', 'data.retention')];
}

function checkTierTwoData(manifest: ManifestRecord): KadkIssue[] {
  const issues: KadkIssue[] = [];
  const database = recordAt(manifest, 'database');
  if (hasKey(manifest, 'legacyTables')) issues.push(createKadkIssue('KADK-301', 'legacyTables'));
  if (hasKey(database, 'readAccess'))
    issues.push(createKadkIssue('KADK-302', 'database.readAccess'));

  const owned = stringsAt(database, 'ownedTables', 'database.ownedTables');
  const schema = recordAt(manifest, 'data')['schema'];
  if (owned.length > 0 && typeof schema !== 'string') {
    issues.push(createKadkIssue('KADK-305', 'data.schema'));
  } else if (typeof schema === 'string') {
    for (const entry of owned.filter((table) => !table.value.startsWith(`${schema}.`))) {
      issues.push(createKadkIssue('KADK-303', entry.path, { value: entry.value, schema }));
    }
  }
  return issues;
}

/** 0b S7: a legacy entry must name an owned table, and a rename must land in the addon prefix. */
function checkLegacyTables(manifest: ManifestRecord, id: string): KadkIssue[] {
  const owned = new Set(
    stringsAt(recordAt(manifest, 'database'), 'ownedTables', '').map((entry) => entry.value)
  );
  const schema = recordAt(manifest, 'data')['schema'];
  const prefixes = [
    `${id.replace(/-/g, '_')}_`,
    ...(typeof schema === 'string' ? [`${schema}.`] : []),
  ];
  const label = prefixes.map((prefix) => `'${prefix}'`).join(' or ');
  const issues = fieldsAt(manifest, 'legacyTables', 'tableName', 'legacyTables')
    .filter((entry) => !owned.has(entry.value))
    .map((entry) => createKadkIssue('KADK-306', entry.path, { value: entry.value }));
  const renames = fieldsAt(manifest, 'legacyTables', 'newName', 'legacyTables');
  for (const entry of renames.filter(
    (rename) => !prefixes.some((prefix) => rename.value.startsWith(prefix))
  )) {
    issues.push(createKadkIssue('KADK-307', entry.path, { value: entry.value, prefixes: label }));
  }
  return issues;
}

/** Runs every rule. `id` is the manifest id, already known to match the id pattern. */
export function checkManifestV2Rules(
  manifest: ManifestRecord,
  id: string,
  options: ManifestValidationOptions
): KadkIssue[] {
  const tierRules =
    manifest['tier'] === 2 ? checkTierTwoData(manifest) : checkLegacyTables(manifest, id);
  return [
    ...checkReservedId(id, options),
    ...checkNamespaces(manifest, id),
    ...checkDuplicates(manifest),
    ...checkCapabilityOverlap(manifest),
    ...checkRequiredPermissions(manifest),
    ...checkGroupPermissions(manifest),
    ...checkPackagePaths(manifest),
    ...checkEventSchemaFiles(manifest),
    ...checkDataRetention(manifest),
    ...checkRuntimeLoadedUi(manifest),
    ...checkDataSchemaName(manifest, id),
    ...tierRules,
  ];
}
