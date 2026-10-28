/**
 * Maps manifest schema failures onto the existing KADK-1xx catalog.
 * The keyword map matches validateManifestV2 in @kassis/addon-sdk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { AdkIssue } from './types.ts';
import { isRecordValue, kadkIssue, repoRoot } from './issues.ts';

declare global {
  var __KASSIS_ADK_PACKED__: boolean | undefined;
}

interface SchemaError {
  readonly keyword: string;
  readonly instancePath: string;
  readonly message?: string;
  readonly params: Record<string, unknown>;
}

interface SchemaValidator {
  (data: unknown): boolean;
  errors?: SchemaError[] | null;
}

interface Ajv2020 {
  compile(schema: object): SchemaValidator;
}

interface Ajv2020Constructor {
  new (options: {
    allErrors: boolean;
    strict: boolean;
    strictTypes: boolean;
    strictTuples: boolean;
    strictRequired: boolean;
    logger: false;
  }): Ajv2020;
}

const REMOVED_FIELDS = {
  routing: 'KADK-105',
  entry: 'KADK-106',
  permissionNamespaceWaiver: 'KADK-107',
} as const;

const V1_HOMES: Readonly<Record<string, string>> = {
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

let validator: SchemaValidator | null = null;

function schemaPath(): string {
  const home = repoRoot();
  const installed = path.join(home, 'schema/addon-manifest.v2.schema.json');
  if (globalThis.__KASSIS_ADK_PACKED__ === true) {
    if (!fs.existsSync(installed)) throw new Error('addon manifest schema was not found');
    return installed;
  }
  const repoSchema = path.join(home, 'packages/addon-sdk/schema/addon-manifest.v2.schema.json');
  if (fs.existsSync(repoSchema)) return repoSchema;
  if (fs.existsSync(installed)) return installed;
  throw new Error('addon manifest schema was not found');
}

function loadAjv(): Ajv2020Constructor {
  const require = createRequire(import.meta.url);
  const loaded: unknown = require('ajv/dist/2020.js');
  if (typeof loaded === 'function') return loaded as Ajv2020Constructor;
  if (isRecordValue(loaded) && typeof loaded.default === 'function') {
    return loaded.default as Ajv2020Constructor;
  }
  throw new Error('ajv is not installed');
}

function manifestValidator(): SchemaValidator {
  if (validator) return validator;
  const parsed: unknown = JSON.parse(fs.readFileSync(schemaPath(), 'utf8'));
  if (!isRecordValue(parsed)) throw new Error('addon manifest schema was not found');
  const Ajv = loadAjv();
  validator = new Ajv({
    allErrors: true,
    strict: true,
    strictTypes: false,
    strictTuples: false,
    strictRequired: false,
    logger: false,
  }).compile(parsed);
  return validator;
}

function toDottedPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((dotted, segment) => {
      if (/^\d+$/.test(segment)) return `${dotted}[${segment}]`;
      return dotted ? `${dotted}.${segment}` : segment;
    }, '');
}

function stringParam(error: SchemaError, name: string): string {
  const value = error.params[name];
  return typeof value === 'string' ? value : '';
}

function unknownFieldIssue(dotted: string, field: string): AdkIssue {
  if (dotted === '' && (field === 'routing' || field === 'entry' || field === 'permissionNamespaceWaiver')) {
    return kadkIssue(REMOVED_FIELDS[field], 'manifest.json', null, { path: field });
  }
  const home = dotted === '' ? V1_HOMES[field] : undefined;
  if (home) return kadkIssue('KADK-108', 'manifest.json', null, { path: field, field, home });
  return kadkIssue('KADK-103', 'manifest.json', null, { path: dotted, field });
}

function schemaIssue(error: SchemaError): AdkIssue | null {
  const dotted = toDottedPath(error.instancePath);
  switch (error.keyword) {
    case 'required': {
      const field = stringParam(error, 'missingProperty');
      if (dotted === '' && field === 'manifestVersion') {
        return kadkIssue('KADK-104', 'manifest.json', null, { path: 'manifestVersion' });
      }
      return kadkIssue('KADK-102', 'manifest.json', null, { path: dotted, field });
    }
    case 'additionalProperties':
      return unknownFieldIssue(dotted, stringParam(error, 'additionalProperty'));
    case 'const':
      return dotted === 'manifestVersion'
        ? kadkIssue('KADK-104', 'manifest.json', null, { path: dotted })
        : kadkIssue('KADK-101', 'manifest.json', null, {
            path: dotted,
            detail: error.message ?? 'has the wrong value',
          });
    case 'if':
      return null;
    default:
      return kadkIssue('KADK-101', 'manifest.json', null, {
        path: dotted,
        detail: error.message ?? 'is invalid',
      });
  }
}

function permissionIssues(manifest: Record<string, unknown>): AdkIssue[] {
  const id = manifest.id;
  if (typeof id !== 'string' || id.length === 0) return [];
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const issues: AdkIssue[] = [];
  permissions.forEach((permission, index) => {
    if (!isRecordValue(permission) || typeof permission.name !== 'string') return;
    if (permission.name.startsWith(`${id}.`)) return;
    issues.push(
      kadkIssue('KADK-110', 'manifest.json', null, {
        path: `permissions[${index}].name`,
        value: permission.name,
        prefixes: `${id}.`,
      })
    );
  });
  return issues;
}

/** Schema and permission-prefix issues for one addon directory. */
export function checkManifestDirectory(dir: string): AdkIssue[] {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    return [kadkIssue('KADK-102', 'manifest.json', null, { path: '', field: 'manifest.json' })];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return [kadkIssue('KADK-101', 'manifest.json', null, { path: 'manifest.json', detail: 'is not valid JSON' })];
  }
  if (!isRecordValue(parsed)) {
    return [kadkIssue('KADK-101', 'manifest.json', null, { path: '', detail: 'must be a JSON object' })];
  }
  const validate = manifestValidator();
  const matches = validate(parsed);
  const schemaIssues = matches ? [] : (validate.errors ?? []).flatMap((error) => schemaIssue(error) ?? []);
  return [...schemaIssues, ...permissionIssues(parsed), ...entryFileIssues(parsed)];
}

function entryFileIssues(manifest: Record<string, unknown>): AdkIssue[] {
  const ui = manifest.ui;
  if (!isRecordValue(ui) || typeof ui.entryFile !== 'string') return [];
  if (!ui.entryFile.includes('/')) return [];
  return [kadkIssue('KADK-504', 'manifest.json', null, { value: ui.entryFile })];
}
