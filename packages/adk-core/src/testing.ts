/**
 * @kassis/adk-core/testing: kit internals the Kassis host uses in its contract tests
 * (host against the pinned kit). Not part of the addon developer API; it may change
 * in any kit release. Addon code should use @kassis/addon-sdk and @kassis/addon-cli.
 */
export { buildAddon } from './engine/addonBuild.mjs';
export { conformanceIssues } from './engine/addonConformance.mjs';
export { readBundledProfile, verifyProfileSignature } from './engine/profileBundle.mjs';
export { signManifestFile } from './engine/signManifest.mjs';
export { devHostTier2Plan, type DevHostTier2Plan } from './devHostTier2.ts';
export { migrateWithRunner, migrationChecksum, type SqlRunner } from './migrateCommand.ts';
export { planTransaction, splitPsqlScript, type TransactionPlan } from './sqlTransactionScan.ts';
