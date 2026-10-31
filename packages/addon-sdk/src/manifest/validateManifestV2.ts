/**
 * validateManifestV2: Ajv against the manifest v2 schema, then the rules in manifestV2Rules.
 * Pure: no file system, network or environment access. The compiled schema is cached for the
 * life of the process.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';

import { createKadkIssue, type KadkIssue } from '../codes/kadkCodes.js';
import { ADDON_MANIFEST_V2_SCHEMA } from './manifestV2Schema.js';
import { checkManifestV2Rules, type ManifestValidationOptions } from './manifestV2Rules.js';

export interface ManifestValidationResult {
  readonly ok: boolean;
  readonly issues: KadkIssue[];
}

/** Where each manifest v1 top-level field lives in v2. Used for the KADK-108 message. */
export const MANIFEST_V1_FIELD_HOMES: Readonly<Record<string, string>> = {
  definedPermissions: 'permissions',
  permissionNamespace: 'the addon id (names start with <id>.)',
  consumesCapabilities: 'requires or optional',
  dependencies: 'requires or optional',
  capabilities: 'metadata.tags',
  auditableActions: 'audit.actions',
  workers: 'events.subscribes with ctx.events.subscribe',
  frontend: 'ui.contributions',
  hostApiVersion: 'hostApi',
  compatibleAppVersion: 'hostApi',
  compatibility: 'hostApi',
  licenseRequirement: 'ctx.extend.registerLicenseFeatures',
  author: 'metadata.author',
  packageLicense: 'metadata.license',
  displayName: 'metadata.displayName',
  description: 'metadata.description',
  shortId: 'resourceTypes[].type (the short id prefix)',
  menuGroup: 'ui.contributions.nav[].section',
  route: 'ui.contributions.deepLinks',
  tfCapabilities: 'nothing (no addon declares it)',
};

const REMOVED_FIELD_CODES = {
  routing: 'KADK-105',
  entry: 'KADK-106',
  permissionNamespaceWaiver: 'KADK-107',
} as const;

let compiledSchema: ValidateFunction | null = null;

function manifestSchemaValidator(): ValidateFunction {
  compiledSchema ??= new Ajv2020({
    allErrors: true,
    strict: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    logger: false,
  }).compile(ADDON_MANIFEST_V2_SCHEMA);
  return compiledSchema;
}

/** `/events/publishes/0/name` → `events.publishes[0].name`. */
function toDottedPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((path, segment) => {
      if (/^\d+$/.test(segment)) return `${path}[${segment}]`;
      return path ? `${path}.${segment}` : segment;
    }, '');
}

function stringParam(error: ErrorObject, name: string): string {
  const value: unknown = error.params[name];
  return typeof value === 'string' ? value : '';
}

function unknownFieldIssue(path: string, field: string): KadkIssue {
  if (path === '') {
    if (field === 'routing' || field === 'entry' || field === 'permissionNamespaceWaiver') {
      return createKadkIssue(REMOVED_FIELD_CODES[field], field);
    }
    const home = MANIFEST_V1_FIELD_HOMES[field];
    if (home) return createKadkIssue('KADK-108', field, { field, home });
  }
  return createKadkIssue('KADK-103', path, { field });
}

function schemaIssue(error: ErrorObject): KadkIssue | null {
  const path = toDottedPath(error.instancePath);
  switch (error.keyword) {
    case 'required': {
      const field = stringParam(error, 'missingProperty');
      if (path === '' && field === 'manifestVersion')
        return createKadkIssue('KADK-104', 'manifestVersion');
      return createKadkIssue('KADK-102', path, { field });
    }
    case 'additionalProperties':
      return unknownFieldIssue(path, stringParam(error, 'additionalProperty'));
    case 'const':
      return path === 'manifestVersion'
        ? createKadkIssue('KADK-104', path)
        : createKadkIssue('KADK-101', path, { detail: error.message ?? 'has the wrong value' });
    case 'if':
      // The failing `then` branch is reported on its own.
      return null;
    default:
      return createKadkIssue('KADK-101', path, { detail: error.message ?? 'is invalid' });
  }
}

function isManifestObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates a parsed manifest. `ok` is true only when there are no issues. Rules that need the
 * addon id (namespaces, data schema) run only when the id itself passed the schema.
 */
export function validateManifestV2(
  manifest: unknown,
  options: ManifestValidationOptions = {}
): ManifestValidationResult {
  if (!isManifestObject(manifest)) {
    const issues = [createKadkIssue('KADK-101', '', { detail: 'must be a JSON object' })];
    return { ok: false, issues };
  }

  const validate = manifestSchemaValidator();
  validate(manifest);
  const errors = validate.errors ?? [];
  const issues = errors.flatMap((error) => schemaIssue(error) ?? []);

  const id = manifest['id'];
  const idIsValid = typeof id === 'string' && !errors.some((error) => error.instancePath === '/id');
  if (idIsValid) {
    issues.push(...checkManifestV2Rules(manifest, id, options));
  }
  return { ok: issues.length === 0, issues };
}
