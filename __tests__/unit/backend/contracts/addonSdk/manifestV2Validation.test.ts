import fs from 'node:fs';
import path from 'node:path';
import {
  ADDON_MANIFEST_V2_SCHEMA,
  MANIFEST_EXTEND_POINT_IDS,
  MANIFEST_RESOURCE_SENSITIVITY_LEVELS,
  validateManifestV2,
  type KadkCode,
} from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';

import { MANIFEST_V2_KEYS, validManifest } from './fixtures/manifestV2.fixture.js';

type MutableManifest = Record<string, unknown>;

function manifestWith(changes: MutableManifest, remove: string[] = []): MutableManifest {
  const manifest: MutableManifest = { ...structuredClone(validManifest), ...changes };
  for (const key of remove) delete manifest[key];
  return manifest;
}

function tierOne(changes: MutableManifest = {}): MutableManifest {
  return manifestWith({
    tier: 1,
    data: { schema: 'addon_sample_tprm_check', retention: 'retain' },
    database: { ownedTables: ['tprm_assessments'] },
    ...changes,
  });
}

function codesOf(manifest: unknown): string[] {
  return validateManifestV2(manifest).issues.map((issue) => issue.code);
}

function expectOnly(manifest: unknown, code: KadkCode, pathPrefix?: string): void {
  const { ok, issues } = validateManifestV2(manifest);
  expect(ok).toBe(false);
  expect(issues.map((issue) => issue.code)).toEqual([code]);
  if (pathPrefix !== undefined) expect(issues[0]?.path.startsWith(pathPrefix)).toBe(true);
}

describe('validateManifestV2', () => {
  it('accepts the reference manifest', () => {
    expect(validateManifestV2(validManifest)).toEqual({ ok: true, issues: [] });
  });

  it('accepts a process pack list and rejects a path outside process/', () => {
    const pack = {
      key: 'sample-tprm-check.case.application',
      kind: 'case-template',
      file: 'process/application.json',
    };
    expect(validateManifestV2(manifestWith({ process: { packs: [pack] } })).ok).toBe(true);
    expectOnly(
      manifestWith({ process: { packs: [{ ...pack, file: 'process/../secret.json' }] } }),
      'KADK-101',
      'process.packs[0].file'
    );
  });

  it('accepts uiContentHash next to contentHash', () => {
    const hash = `sha256-${'ab'.repeat(32)}`;
    expect(validateManifestV2(manifestWith({ contentHash: hash, uiContentHash: hash })).ok).toBe(
      true
    );
    expectOnly(manifestWith({ uiContentHash: 'sha256-zz' }), 'KADK-101', 'uiContentHash');
  });

  it('accepts a signing block and rejects a bad algorithm', () => {
    const keyId = 'a'.repeat(64);
    expect(validateManifestV2(manifestWith({ signing: { alg: 'ed25519', keyId } })).ok).toBe(true);
    expectOnly(manifestWith({ signing: { alg: 'rsa', keyId } }), 'KADK-101', 'signing.alg');
  });

  it('accepts a tier 1 manifest with core read access and an owned legacy table', () => {
    const manifest = tierOne({
      database: { ownedTables: ['tprm_assessments'], readAccess: ['entities'] },
      legacyTables: [
        { tableName: 'tprm_assessments', strategy: 'retain', removalDeadline: '2027-12-31' },
      ],
    });
    expect(validateManifestV2(manifest)).toEqual({ ok: true, issues: [] });
  });

  it('keeps AddonManifestV2 and the JSON Schema on the same top-level fields', () => {
    const properties = ADDON_MANIFEST_V2_SCHEMA['properties'];
    expect(properties && typeof properties === 'object').toBe(true);
    expect(Object.keys(properties as object).sort()).toEqual(Object.keys(MANIFEST_V2_KEYS).sort());
  });

  it('reports every issue with code, path, message, fix and docs link', () => {
    const [issue] = validateManifestV2(manifestWith({ jobs: { types: ['core.reindex'] } })).issues;
    expect(issue).toEqual({
      code: 'KADK-111',
      path: 'jobs.types[0]',
      message:
        "Job type 'core.reindex' at jobs.types[0] must start with 'sample-tprm-check.' or 'sample_tprm_check.'",
      fix: "Rename the job type so it starts with 'sample-tprm-check.' or 'sample_tprm_check.'.",
      docs: 'docs/developer/reference/adk-error-codes.md#kadk-111',
    });
  });

  describe('schema rules', () => {
    it('rejects a value that is not an object (KADK-101)', () => {
      expectOnly([], 'KADK-101');
    });

    it('rejects a value that breaks a pattern (KADK-101)', () => {
      expectOnly(manifestWith({ hostApi: '1.x' }), 'KADK-101', 'hostApi');
    });

    it('rejects a missing required field (KADK-102)', () => {
      expectOnly(manifestWith({}, ['publisher']), 'KADK-102');
    });

    it('rejects an unknown nested field (KADK-103)', () => {
      expectOnly(manifestWith({ audit: { actions: [], vocabulary: 'x' } }), 'KADK-103', 'audit');
    });

    it('rejects a manifest that is not version 2 (KADK-104)', () => {
      expectOnly(manifestWith({ manifestVersion: 1 }), 'KADK-104', 'manifestVersion');
      expect(codesOf(manifestWith({}, ['manifestVersion']))).toEqual(['KADK-104']);
    });

    it('rejects routing.mountPath (KADK-105)', () => {
      expectOnly(manifestWith({ routing: { mountPath: '/api/v1/cases' } }), 'KADK-105', 'routing');
    });

    it('rejects entry (KADK-106)', () => {
      expectOnly(manifestWith({ entry: 'index.js' }), 'KADK-106', 'entry');
    });

    it('rejects permissionNamespaceWaiver (KADK-107)', () => {
      expectOnly(
        manifestWith({ permissionNamespaceWaiver: { approved: true, namespaces: ['cases'] } }),
        'KADK-107'
      );
    });

    it('names the v2 home of a v1 field (KADK-108)', () => {
      const { issues } = validateManifestV2(
        manifestWith({ consumesCapabilities: ['party.lookup'] })
      );
      expect(issues.map((issue) => issue.code)).toEqual(['KADK-108']);
      expect(issues[0]?.message).toContain('requires or optional');
    });

    it('requires newName for a rename (KADK-102)', () => {
      const manifest = tierOne({
        legacyTables: [
          { tableName: 'tprm_assessments', strategy: 'rename', removalDeadline: '2027-12-31' },
        ],
      });
      expect(codesOf(manifest)).toEqual(['KADK-102']);
    });
  });

  describe('semantic rules', () => {
    it('rejects an addon id reserved by the host (KADK-109)', () => {
      const result = validateManifestV2(validManifest, {
        reservedNamespaces: ['cases', 'sample_tprm_check'],
      });
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-109']);
    });

    it.each([
      [
        'KADK-110',
        { permissions: [{ name: 'cases.view' }], requiredPermissions: [] },
        'permissions[0].name',
      ],
      ['KADK-111', { jobs: { types: ['cr_btm_daily_scan.run'] } }, 'jobs.types[0]'],
      ['KADK-112', { prompts: { keys: ['fincrime.case.summary'] } }, 'prompts.keys[0]'],
      ['KADK-113', { secrets: { keys: ['core:jwt-secret'] } }, 'secrets.keys[0]'],
      [
        'KADK-114',
        {
          events: {
            publishes: [{ name: 'case.closed', schema: 'events/case.schema.json' }],
            subscribes: [],
          },
        },
        'events.publishes[0].name',
      ],
      ['KADK-115', { audit: { actions: ['user.login'] } }, 'audit.actions[0]'],
      [
        'KADK-122',
        {
          groups: [
            {
              name: 'cases-reviewer',
              displayName: 'Reviewers',
              permissions: ['sample-tprm-check.view'],
            },
          ],
        },
        'groups[0].name',
      ],
      [
        'KADK-220',
        { provides: [{ capability: 'tprm.assessment', version: '1.0.0' }] },
        'provides[0].capability',
      ],
    ] as const)('rejects a name outside the addon namespace (%s)', (code, changes, issuePath) => {
      expectOnly(manifestWith(changes), code, issuePath);
    });

    it('accepts the underscore form of the id as a namespace', () => {
      expect(codesOf(manifestWith({ jobs: { types: ['sample_tprm_check.rescreen'] } }))).toEqual(
        []
      );
    });

    it('rejects duplicate entries (KADK-116)', () => {
      expectOnly(
        manifestWith({ egress: { hosts: ['api.example.com', 'api.example.com'] } }),
        'KADK-116',
        'egress.hosts'
      );
      expectOnly(
        manifestWith({ secrets: { keys: ['sample-tprm-check:a', 'sample-tprm-check:a'] } }),
        'KADK-116',
        'secrets.keys'
      );
    });

    it('rejects a capability that is both required and optional (KADK-117)', () => {
      expectOnly(
        manifestWith({ optional: [{ capability: 'party.lookup', range: '^1.0.0' }] }),
        'KADK-117',
        'optional[0]'
      );
    });

    it('rejects a required permission that is not declared (KADK-118)', () => {
      expectOnly(
        manifestWith({ requiredPermissions: ['sample-tprm-check.admin'] }),
        'KADK-118',
        'requiredPermissions[0]'
      );
    });

    it('accepts a manifest group in the addon namespace', () => {
      const groups = [
        {
          name: 'sample-tprm-check-reviewers',
          displayName: 'TPRM reviewers',
          permissions: ['sample-tprm-check.view', 'sample-tprm-check.run'],
        },
      ];
      expect(codesOf(manifestWith({ groups }))).toEqual([]);
    });

    it('rejects a group permission that is not declared (KADK-123)', () => {
      const groups = [
        {
          name: 'sample-tprm-check.reviewers',
          displayName: 'TPRM reviewers',
          permissions: ['sample-tprm-check.admin'],
        },
      ];
      expectOnly(manifestWith({ groups }), 'KADK-123', 'groups[0].permissions[0]');
    });

    it('rejects duplicate group names (KADK-116)', () => {
      const groups = [
        {
          name: 'sample-tprm-check.reviewers',
          displayName: 'A',
          permissions: ['sample-tprm-check.view'],
        },
        {
          name: 'sample-tprm-check.reviewers',
          displayName: 'B',
          permissions: ['sample-tprm-check.run'],
        },
      ];
      expectOnly(manifestWith({ groups }), 'KADK-116', 'groups');
    });

    it('rejects a package path that leaves the package (KADK-120)', () => {
      expectOnly(
        manifestWith({ entrypoints: { main: 'dist/../../server/index.js' } }),
        'KADK-120',
        'entrypoints.main'
      );
    });

    it('rejects an event schema that is not a .schema.json file (KADK-406)', () => {
      const events = {
        publishes: [
          { name: 'sample-tprm-check.assessment.completed', schema: 'events/completed.json' },
        ],
        subscribes: ['party.updated'],
      };
      expectOnly(manifestWith({ events }), 'KADK-406', 'events.publishes[0].schema');
    });

    it('rejects runtime-loaded UI without an entry file (KADK-501)', () => {
      expectOnly(manifestWith({ ui: { runtimeLoad: true } }), 'KADK-501', 'ui.entryFile');
    });

    it('rejects an unknown extends entry (KADK-101)', () => {
      expectOnly(manifestWith({ extends: ['notAnExtensionPoint'] }), 'KADK-101', 'extends[0]');
    });

    it('rejects duplicate extends entries (KADK-116)', () => {
      expectOnly(
        manifestWith({ extends: ['documentable', 'documentable'] }),
        'KADK-116',
        'extends'
      );
    });

    it('accepts declared extends entries', () => {
      expect(validateManifestV2(manifestWith({ extends: ['documentable', 'auditSubject'] })).ok).toBe(
        true
      );
    });

    it('rejects a free-text resource sensitivity value (KADK-101)', () => {
      const resourceTypes = [
        {
          type: 'tprm:assessment',
          label: 'TPRM assessment',
          abilities: { preview: true },
          sensitivity: 'public',
        },
      ];
      expectOnly(manifestWith({ resourceTypes }), 'KADK-101', 'resourceTypes[0].sensitivity');
    });

    it('requires sensitivity on each resource type when the addon owns tables (KADK-124)', () => {
      const resourceTypes = [
        {
          type: 'tprm:assessment',
          label: 'TPRM assessment',
          abilities: { preview: true },
        },
      ];
      expectOnly(manifestWith({ resourceTypes }), 'KADK-124', 'resourceTypes[0].sensitivity');
    });

    it('keeps schema enums aligned with manifest catalog constants', () => {
      const defs = ADDON_MANIFEST_V2_SCHEMA['$defs'];
      expect(defs && typeof defs === 'object').toBe(true);
      const extendEnum = (defs as Record<string, unknown>)['manifestExtendPointId'];
      const sensitivityEnum = (defs as Record<string, unknown>)['resourceSensitivityLevel'];
      expect((extendEnum as { enum: string[] }).enum).toEqual([...MANIFEST_EXTEND_POINT_IDS]);
      expect((sensitivityEnum as { enum: string[] }).enum).toEqual([
        ...MANIFEST_RESOURCE_SENSITIVITY_LEVELS,
      ]);
    });
  });

  describe('tier and data rules', () => {
    it('rejects legacyTables on a tier 2 addon (KADK-301)', () => {
      const legacyTables = [
        { tableName: 'tprm_assessments', strategy: 'retain', removalDeadline: '2027-12-31' },
      ];
      expectOnly(manifestWith({ legacyTables }), 'KADK-301', 'legacyTables');
    });

    it('rejects core read access on a tier 2 addon (KADK-302)', () => {
      const database = {
        ownedTables: ['addon_sample_tprm_check.assessments'],
        readAccess: ['entities'],
      };
      expectOnly(manifestWith({ database }), 'KADK-302', 'database.readAccess');
    });

    it('rejects a tier 2 owned table outside data.schema (KADK-303)', () => {
      expectOnly(
        manifestWith({ database: { ownedTables: ['audit_logs'] } }),
        'KADK-303',
        'database.ownedTables[0]'
      );
    });

    it('rejects a data.schema that does not match the id (KADK-304)', () => {
      const changes = {
        data: { schema: 'addon_other', retention: 'retain' },
        database: { ownedTables: ['addon_other.assessments'] },
      };
      expectOnly(manifestWith(changes), 'KADK-304', 'data.schema');
    });

    it('rejects tier 2 tables without data.schema (KADK-305)', () => {
      const { ok, issues } = validateManifestV2(
        manifestWith({ database: { ownedTables: ['addon_sample_tprm_check.assessments'] } }, [
          'data',
        ])
      );
      expect(ok).toBe(false);
      expect(issues.map((issue) => issue.code)).toEqual(['KADK-309', 'KADK-305']);
    });

    it('rejects owned tables without data.retention (KADK-309)', () => {
      expectOnly(
        manifestWith({ data: { schema: 'addon_sample_tprm_check' } }),
        'KADK-309',
        'data.retention'
      );
    });

    it.each(['retain', 'archive', 'purge'] as const)(
      'accepts data.retention %s when owned tables are declared',
      (retention) => {
        const database = { ownedTables: ['addon_sample_tprm_check.assessments'] };
        const data = { schema: 'addon_sample_tprm_check', retention };
        expect(validateManifestV2(manifestWith({ data, database })).ok).toBe(true);
      }
    );

    it('accepts database.tableNotes for an owned table', () => {
      const database = {
        ownedTables: ['addon_sample_tprm_check.assessments'],
        tableNotes: [
          {
            table: 'addon_sample_tprm_check.assessments',
            notCoreRecord: 'case',
            why: 'Assessment rows are not cases',
          },
        ],
      };
      const data = { schema: 'addon_sample_tprm_check', retention: 'retain' };
      expect(validateManifestV2(manifestWith({ data, database })).ok).toBe(true);
    });

    it('rejects an invalid data.retention value (KADK-101)', () => {
      const data = {
        schema: 'addon_sample_tprm_check',
        retention: 'delete',
      };
      expectOnly(manifestWith({ data, database: {} }), 'KADK-101', 'data.retention');
    });

    it('rejects a legacy table the addon does not own (KADK-306)', () => {
      const legacyTables = [
        { tableName: 'audit_logs', strategy: 'retain', removalDeadline: '2027-12-31' },
      ];
      expectOnly(tierOne({ legacyTables }), 'KADK-306', 'legacyTables[0].tableName');
    });

    it('rejects a legacy rename outside the addon prefix (KADK-307)', () => {
      const legacyTables = [
        {
          tableName: 'tprm_assessments',
          strategy: 'rename',
          newName: 'cases_archive',
          removalDeadline: '2027-12-31',
        },
      ];
      expectOnly(tierOne({ legacyTables }), 'KADK-307', 'legacyTables[0].newName');
    });
  });

  // First-party addons live in the host repository only.
  it.skipIf(!fs.existsSync(path.resolve('addons')))('reports every current v1 addon manifest as not v2 (KADK-104)', () => {
    const addonsDir = path.resolve('addons');
    const manifests = fs
      .readdirSync(addonsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(addonsDir, entry.name, 'manifest.json'))
      .filter((file) => fs.existsSync(file));

    expect(manifests.length).toBeGreaterThan(0);
    for (const file of manifests) {
      const manifest: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      expect(codesOf(manifest), file).toContain('KADK-104');
    }
  });
});
