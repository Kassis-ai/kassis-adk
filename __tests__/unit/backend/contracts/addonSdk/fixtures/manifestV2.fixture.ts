/**
 * Typechecked by addonSdkTypes.test.ts (TypeScript compiler API) and validated at runtime by
 * manifestV2Validation.test.ts. Lines marked @ts-expect-error must fail to compile.
 */
import type { AddonManifestV2 } from '@kassis/addon-sdk';

export const validManifest = {
  manifestVersion: 2,
  id: 'sample-tprm-check',
  name: 'Sample TPRM check',
  version: '1.0.0',
  publisher: 'kassis-corp',
  tier: 2,
  hostApi: '^1.0.0',
  entrypoints: { main: 'dist/index.js' },
  permissions: [
    { name: 'sample-tprm-check.view', displayName: 'View checks', default: true },
    { name: 'sample-tprm-check.run', description: 'Run a check' },
  ],
  requiredPermissions: ['sample-tprm-check.view'],
  requires: [{ capability: 'party.lookup', range: '^1.0.0' }],
  optional: [{ capability: 'aml.screening', range: '>=1.0.0 <2.0.0' }],
  provides: [{ capability: 'sample-tprm-check.assessment', version: '1.0.0' }],
  events: {
    publishes: [
      {
        name: 'sample-tprm-check.assessment.completed',
        schema: 'events/assessment-completed.schema.json',
      },
    ],
    subscribes: ['party.updated'],
  },
  audit: { actions: ['sample-tprm-check.assessment.run'] },
  egress: { hosts: ['api.example.com', '*.vendor.example'] },
  jobs: { types: ['sample-tprm-check.rescreen'] },
  prompts: { keys: ['sample_tprm_check.summary.v1'] },
  secrets: { keys: ['sample-tprm-check:vendor-api-key'] },
  config: {
    schema: { type: 'object', properties: { batchSize: { type: 'integer', minimum: 1 } } },
  },
  data: { schema: 'addon_sample_tprm_check', retention: 'retain' },
  database: { ownedTables: ['addon_sample_tprm_check.assessments'] },
  contributions: { mcp: { entry: 'dist/mcp/contribution.js', tools: ['tprm_assessment_get'] } },
  resourceTypes: [
    {
      type: 'tprm:assessment',
      label: 'TPRM assessment',
      abilities: { preview: true, search: true },
      sensitivity: 'confidential',
      viewPermissions: ['sample-tprm-check.view'],
    },
  ],
  ui: {
    entryFile: 'index.js',
    runtimeLoad: true,
    contributions: {
      featureFlag: 'tprm',
      nav: [
        { section: 'Parties', name: 'TPRM', href: 'tprm', permissions: ['sample-tprm-check.view'] },
      ],
      deepLinks: [{ id: 'tprm.home', path: '/tprm' }],
    },
    slots: [
      { slot: 'party.detail.tabs', component: 'TprmTab', permission: 'sample-tprm-check.view' },
    ],
  },
  metadata: { description: 'Third-party risk checks', tags: ['tprm'], license: 'UNLICENSED' },
} as const satisfies AddonManifestV2;

/** Every key of AddonManifestV2, once; the test compares this list with the schema's properties. */
export const MANIFEST_V2_KEYS = {
  manifestVersion: true,
  id: true,
  name: true,
  version: true,
  publisher: true,
  tier: true,
  hostApi: true,
  entrypoints: true,
  signature: true,
  signing: true,
  contentHash: true,
  uiContentHash: true,
  permissions: true,
  requiredPermissions: true,
  groups: true,
  requires: true,
  optional: true,
  provides: true,
  events: true,
  audit: true,
  egress: true,
  resources: true,
  health: true,
  jobs: true,
  prompts: true,
  secrets: true,
  config: true,
  data: true,
  database: true,
  legacyTables: true,
  contributions: true,
  extends: true,
  resourceTypes: true,
  ui: true,
  metadata: true,
} as const satisfies Record<keyof AddonManifestV2, true>;

const routing = { mountPath: '/api/v1/cases' };

// @ts-expect-error routing is derived from the id and cannot be set
export const withRouting: AddonManifestV2 = { ...validManifest, routing };

// @ts-expect-error a v1 manifest is not a v2 manifest
export const versionOne: AddonManifestV2 = { ...validManifest, manifestVersion: 1 };

// @ts-expect-error tier is 1 or 2
export const tierThree: AddonManifestV2 = { ...validManifest, tier: 3 };
