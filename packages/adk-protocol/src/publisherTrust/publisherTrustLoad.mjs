import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublisherTrustError } from './publisherTrustError.mjs';
import { mergePublisherTrust } from './publisherTrustMerge.mjs';
import { normalizePublisherTrust } from './publisherTrustNormalize.mjs';

// The host and the kit pass the repository seed via configurePublisherTrustSeed.
// The seeded file stays with the host. This module does not ship a second copy.
// The packed addon-cli bundles this module into lib/ and copies the seed beside it.
const here = path.dirname(fileURLToPath(import.meta.url));
const TTL_MS = 15_000;

/** @type {(() => Promise<unknown>) | null} */
let dbPort = null;
/** @type {{ at: number, snapshot: { publishers: unknown[], keys: unknown[] } } | null} */
let cache = null;
/** @type {string | null} */
let configuredPolicyPath = null;
let invalidationBound = false;
let dbWarningWritten = false;

/**
 * Absolute path of the seeded publisher-trust.json. The host and the kit set
 * this to the repository seed. A packed CLI leaves it unset and reads
 * publisher-trust.json beside the bundle.
 * @param {string} filePath
 */
export function configurePublisherTrustSeed(filePath) {
  const next = path.resolve(filePath);
  if (configuredPolicyPath === next) return;
  configuredPolicyPath = next;
  cache = null;
}

function policyFilePath() {
  if (globalThis.__KASSIS_ADK_PACKED__ === true) {
    return path.join(here, 'publisher-trust.json');
  }
  if (configuredPolicyPath) return configuredPolicyPath;
  throw new PublisherTrustError(
    'Publisher trust seed is not configured. Call configurePublisherTrustSeed before loading a policy.'
  );
}

export function loadPublisherTrustPolicy() {
  return JSON.parse(fs.readFileSync(policyFilePath(), 'utf8'));
}

export function configurePublisherTrustDb(port) {
  dbPort = port;
  invalidatePublisherTrustCache();
}

export function invalidatePublisherTrustCache() {
  cache = null;
}

export function bindPublisherTrustInvalidation(subscribe) {
  if (invalidationBound) return;
  invalidationBound = true;
  subscribe(invalidatePublisherTrustCache);
}

function readTrustFile(filePath) {
  return normalizePublisherTrust(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function optionalTrustFile() {
  const configured = process.env.KASSIS_PUBLISHER_TRUST_FILE;
  if (typeof configured !== 'string' || configured.trim() === '') return null;
  return readTrustFile(configured.trim());
}

function warnDatabase(error) {
  if (dbWarningWritten) return;
  dbWarningWritten = true;
  const message = error instanceof Error ? error.message : 'unknown';
  process.stderr.write(`publisher trust database unavailable: ${message}\n`);
}

export async function loadMergedPublisherTrust() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return structuredClone(cache.snapshot);
  const sources = [readTrustFile(policyFilePath())];
  const extra = optionalTrustFile();
  if (extra) sources.push(extra);
  if (typeof dbPort === 'function') {
    try {
      const rows = await dbPort();
      if (rows) sources.push(normalizePublisherTrust(rows));
    } catch (error) {
      warnDatabase(error);
    }
  }
  const snapshot = mergePublisherTrust(sources);
  cache = { at: now, snapshot };
  return structuredClone(snapshot);
}
