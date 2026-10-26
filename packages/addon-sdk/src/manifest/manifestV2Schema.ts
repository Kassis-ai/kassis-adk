import schema from '../../schema/addon-manifest.v2.schema.json' with { type: 'json' };

import type { JsonSchema } from '../json.js';

/** The manifest v2 JSON Schema (draft 2020-12). The CLI, CI and the host validate against it. */
export const ADDON_MANIFEST_V2_SCHEMA: JsonSchema = schema;
