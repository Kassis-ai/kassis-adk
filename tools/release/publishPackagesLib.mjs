/**
 * Helpers for tools/release/publish-packages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { kitFixedGroup, resolveKitPackages } from './adkKitReleaseLib.mjs';

/** Publish order when dependency metadata is missing (should match maintainer practice). */
export const FALLBACK_PUBLISH_ORDER = [
  '@kassis/adk-protocol',
  '@kassis/mcp-contract',
  '@kassis/addon-sdk',
  '@kassis/addon-testkit',
  '@kassis/adk-core',
  '@kassis/addon-cli',
];

/** @typedef {{ dryRun: boolean, only: string[] | null, tag: string, otp: string | null, skipPreflight: boolean }} PublishOptions */

/**
 * @param {string[]} argv
 * @returns {PublishOptions}
 */
export function parsePublishArgs(argv) {
  /** @type {PublishOptions} */
  const options = {
    dryRun: false,
    only: null,
    tag: 'latest',
    otp: null,
    skipPreflight: false,
  };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--skip-preflight') options.skipPreflight = true;
    else if (arg.startsWith('--only=')) {
      const list = arg
        .slice('--only='.length)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
      if (list.length === 0) throw new Error('--only= needs at least one package name');
      options.only = list;
    } else if (arg.startsWith('--tag=')) {
      const tag = arg.slice('--tag='.length).trim();
      if (!tag) throw new Error('--tag= needs a dist-tag name');
      options.tag = tag;
    } else if (arg.startsWith('--otp=')) {
      const otp = arg.slice('--otp='.length).trim();
      if (!/^\d{6,8}$/.test(otp)) throw new Error('--otp= must be a 6–8 digit npm one-time password');
      options.otp = otp;
    } else if (arg === '--help' || arg === '-h') {
      return options;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return options;
}

/**
 * @param {string} root
 * @param {readonly string[] | null} only
 */
export function selectPackages(root, only) {
  const config = JSON.parse(fs.readFileSync(path.join(root, '.changeset/config.json'), 'utf8'));
  const rank = new Map(FALLBACK_PUBLISH_ORDER.map((name, index) => [name, index]));
  const sortedNames = [...kitFixedGroup(config)].sort(
    (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999) || a.localeCompare(b)
  );
  let packages;
  try {
    packages = resolveKitPackages(root, sortedNames);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'package list failed';
    if (!message.includes('not found') && !message.includes('fixed group')) throw error;
    packages = fallbackPackageList(root);
  }
  if (!only || only.length === 0) return packages;
  const missing = only.filter((name) => !packages.some((pkg) => pkg.name === name));
  if (missing.length > 0) {
    throw new Error(`--only package(s) not in the release group: ${missing.join(', ')}`);
  }
  const set = new Set(only);
  return packages.filter((pkg) => set.has(pkg.name));
}

/**
 * @param {string} root
 */
function fallbackPackageList(root) {
  const packagesDir = path.join(root, 'packages');
  /** @type {Map<string, { name: string, dir: string, version: string, dependencies: string[] }>} */
  const byName = new Map();
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name !== 'string') continue;
    const version = typeof manifest.version === 'string' ? manifest.version : '0.0.0';
    /** @type {string[]} */
    const dependencies = [];
    for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const block = manifest[key];
      if (block && typeof block === 'object' && !Array.isArray(block)) {
        dependencies.push(...Object.keys(block));
      }
    }
    byName.set(manifest.name, {
      name: manifest.name,
      dir: path.join(packagesDir, entry.name),
      version,
      dependencies,
    });
  }
  return FALLBACK_PUBLISH_ORDER.filter((name) => byName.has(name)).map(
    (name) => /** @type {{ name: string, dir: string, version: string, dependencies: string[] }} */ (byName.get(name))
  );
}

/**
 * @param {string} token
 * @param {string} destination
 */
export function writeTempNpmUserconfig(token, destination) {
  const lines = ['registry=https://registry.npmjs.org/', `//registry.npmjs.org/:_authToken=${token}`, ''];
  fs.writeFileSync(destination, lines, { encoding: 'utf8', mode: 0o600 });
}

export const NPM_TOKEN_HELP = `NPM_TOKEN is not set.

Create a granular access token on https://www.npmjs.com/ :
  1. Account menu → Access Tokens → Generate New Token → Granular Access Token
  2. Packages and scopes: select the @kassis packages (or the whole @kassis scope)
  3. Permissions: Read and write
  4. Enable "Bypass two-factor authentication (2FA)"
  5. Set an expiry that fits your release cadence

For one PowerShell session (token is not written to disk):
  $env:NPM_TOKEN = "npm_…"

Then run:
  npm run publish:packages:dry
  npm run publish:packages

Alternatively pass a one-time password for the whole run (codes expire in ~30 seconds):
  node tools/release/publish-packages.mjs --otp=123456

Revoke or rotate the token under Access Tokens on npmjs.com when you no longer need it.`;

/**
 * @param {boolean} dryRun
 * @param {string | null} otp
 * @returns {{ token: string | null, userconfig: string | null, usedOtp: boolean }}
 */
export function resolveAuth(dryRun, otp) {
  const token = process.env.NPM_TOKEN?.trim() || process.env.NODE_AUTH_TOKEN?.trim() || '';
  if (token) return { token, userconfig: null, usedOtp: false };
  if (dryRun) return { token: null, userconfig: null, usedOtp: false };
  if (otp) return { token: null, userconfig: null, usedOtp: true };
  if (githubActionsProvenance()) {
    return { token: null, userconfig: null, usedOtp: false };
  }
  throw new Error(NPM_TOKEN_HELP);
}

export function githubActionsProvenance() {
  return (
    process.env.GITHUB_ACTIONS === 'true' &&
    typeof process.env.ACTIONS_ID_TOKEN_REQUEST_URL === 'string' &&
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL.length > 0
  );
}

/**
 * @param {Array<{ name: string, status: string, detail?: string }>} rows
 */
export function formatSummaryTable(rows) {
  const nameWidth = Math.max(5, ...rows.map((row) => row.name.length));
  const statusWidth = Math.max(6, ...rows.map((row) => row.status.length));
  const header = `${'Package'.padEnd(nameWidth)}  ${'Status'.padEnd(statusWidth)}  Detail`;
  const lines = [header, `${'-'.repeat(nameWidth)}  ${'-'.repeat(statusWidth)}  ${'-'.repeat(20)}`];
  for (const row of rows) {
    lines.push(`${row.name.padEnd(nameWidth)}  ${row.status.padEnd(statusWidth)}  ${row.detail ?? ''}`);
  }
  return `${lines.join('\n')}\n`;
}