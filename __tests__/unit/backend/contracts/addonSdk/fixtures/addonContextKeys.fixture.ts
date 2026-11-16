/**
 * Exhaustive AddonContext top-level keys. Adding a ctx member without a testkit fake
 * fails the type check here and the runtime walk in addonTestContext.test.ts.
 */
import type { AddonContext } from '@kassis/addon-sdk';

/** Every top-level AddonContext member that createTestContext must fake. */
export const ADDON_CONTEXT_FAKE_KEYS = {
  addon: true,
  tenant: true,
  logger: true,
  config: true,
  secrets: true,
  routes: true,
  data: true,
  core: true,
  risk: true,
  settings: true,
  flags: true,
  notify: true,
  audit: true,
  events: true,
  jobs: true,
  locks: true,
  llm: true,
  prompts: true,
  http: true,
  capabilities: true,
  extend: true,
} as const satisfies Record<keyof AddonContext, true>;

export type AddonContextFakeKey = keyof typeof ADDON_CONTEXT_FAKE_KEYS;
