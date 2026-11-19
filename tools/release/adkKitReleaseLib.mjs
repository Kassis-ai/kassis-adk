/**
 * ADK kit release helpers. The package list is the single changesets fixed
 * group, so a package added there (including @kassis/adk-protocol) is published
 * without a second list in the workflow.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CHECKSUMS_FILE = 'checksums.txt';
export const CHECKSUMS_SIG = 'checksums.txt.sig';
export const INDEX_FILE = 'index.json';
export const SBOM_FILE = 'sbom.cdx.json';
export const PUBLIC_KEY_FILE = 'cosign.pub';

/**
 * Path filters for the release test run. vitest matches them as path prefixes, not
 * globs, so a pattern like adk*.test.ts matched nothing. Every unit test here is a kit test.
 */
export const KIT_UNIT_GLOBS = ['__tests__/unit/'];

const TAG_VERSION =
  /^adk\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * @param {unknown} config parsed .changeset/config.json
 * @returns {string[]}
 */
export function kitFixedGroup(config) {
  if (config === null || typeof config !== 'object' || !('fixed' in config)) {
    throw new Error('changesets config has no fixed group');
  }
  const fixed = /** @type {{ fixed: unknown }} */ (config).fixed;
  if (!Array.isArray(fixed)) throw new Error('changesets config has no fixed group');
  const groups = fixed.filter((group) => Array.isArray(group));
  if (groups.length !== 1) {
    throw new Error(`expected one changesets fixed group, found ${groups.length}`);
  }
  const names = groups[0].filter((name) => typeof name === 'string' && name.startsWith('@'));
  if (names.length === 0) throw new Error('changesets fixed group is empty');
  return [...new Set(names)];
}

/**
 * @param {string} tag github.ref_name, for example adk/v0.1.0
 * @returns {string}
 */
export function versionFromAdkTag(tag) {
  const match = TAG_VERSION.exec(tag);
  if (!match) throw new Error(`not an ADK kit tag: ${tag}`);
  return tag.slice('adk/v'.length);
}

/**
 * @param {readonly { name: string, version: string }[]} packages
 * @param {string} version
 */
export function assertGroupVersion(packages, version) {
  const mismatches = packages
    .filter((pkg) => pkg.version !== version)
    .map((pkg) => `${pkg.name}@${pkg.version}`);
  if (mismatches.length > 0) {
    throw new Error(`tag v${version} does not match ${mismatches.join(', ')}`);
  }
}

/**
 * Publish dependencies before the packages that need them.
 * @param {readonly { name: string, version: string, dir: string, dependencies: readonly string[] }[]} packages
 */
export function orderPackages(packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  /** @type {typeof packages[number][]} */
  const ordered = [];
  /** @type {Map<string, 'visiting' | 'done'>} */
  const state = new Map();
  /** @param {string} name */
  const visit = (name) => {
    const mark = state.get(name);
    if (mark === 'done') return;
    if (mark === 'visiting') throw new Error(`cycle in kit packages at ${name}`);
    state.set(name, 'visiting');
    const pkg = byName.get(name);
    if (!pkg) throw new Error(`missing kit package ${name}`);
    for (const dep of pkg.dependencies) {
      if (byName.has(dep)) visit(dep);
    }
    state.set(name, 'done');
    ordered.push(pkg);
  };
  for (const pkg of packages) visit(pkg.name);
  return ordered;
}

/**
 * @param {string} root repository root
 * @param {readonly string[]} names
 */
export function resolveKitPackages(root, names) {
  const packagesDir = path.join(root, 'packages');
  /** @type {Map<string, { dir: string, manifest: Record<string, unknown> }>} */
  const byName = new Map();
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest === null || typeof manifest !== 'object' || typeof manifest.name !== 'string') {
      continue;
    }
    byName.set(manifest.name, { dir: path.join(packagesDir, entry.name), manifest });
  }
  const missing = names.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    throw new Error(`fixed group packages not found under packages/: ${missing.join(', ')}`);
  }
  const rows = names.map((name) => {
    const found = byName.get(name);
    if (!found) throw new Error(`fixed group packages not found under packages/: ${name}`);
    const version = found.manifest.version;
    if (typeof version !== 'string') throw new Error(`${name} has no version`);
    return {
      name,
      dir: found.dir,
      version,
      dependencies: dependencyNames(found.manifest),
    };
  });
  return orderPackages(rows);
}

/**
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
function dependencyNames(manifest) {
  /** @type {string[]} */
  const names = [];
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    const block = manifest[key];
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      names.push(...Object.keys(block));
    }
  }
  return names;
}

/**
 * @param {readonly { name: string, version: string, dependencies: readonly string[] }[]} packages
 * @param {ReadonlyMap<string, string>} digests sha256 hex by package name
 */
export function buildKitSbom(packages, digests) {
  const version = packages[0]?.version;
  if (!version) throw new Error('kit SBOM needs at least one package');
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: { type: 'application', name: 'kassis-adk', version },
    },
    components: packages.map((pkg) => {
      const digest = digests.get(pkg.name);
      return {
        type: 'library',
        name: pkg.name,
        version: pkg.version,
        purl: `pkg:npm/${pkg.name}@${pkg.version}`,
        ...(digest ? { hashes: [{ alg: 'SHA-256', content: digest }] } : {}),
        dependencies: [...pkg.dependencies].sort(),
      };
    }),
  };
}

/**
 * @param {string} stdout npm pack --json
 * @returns {string}
 */
export function packFilename(stdout) {
  let end = stdout.lastIndexOf(']');
  while (end >= 0) {
    let start = stdout.lastIndexOf('[', end);
    while (start >= 0) {
      try {
        const parsed = JSON.parse(stdout.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          if (
            first !== null &&
            typeof first === 'object' &&
            'filename' in first &&
            typeof first.filename === 'string'
          ) {
            return first.filename;
          }
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      start = stdout.lastIndexOf('[', start - 1);
    }
    end = stdout.lastIndexOf(']', end - 1);
  }
  throw new Error(`npm pack did not return JSON\n${stdout}`);
}

/**
 * @param {string} file
 * @returns {string}
 */
export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @param {string[]} files
 */
function walkFiles(dir, prefix, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (rel === CHECKSUMS_FILE || rel === CHECKSUMS_SIG) continue;
    if (rel.includes('..') || entry.name.includes(' ')) {
      throw new Error(`air-gap path is not safe: ${rel}`);
    }
    const lower = rel.toLowerCase();
    if (lower.includes('private') || lower.endsWith('.pem')) {
      throw new Error(`air-gap bundle refuses ${rel}`);
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`air-gap bundle refuses symlink ${rel}`);
    if (entry.isDirectory()) walkFiles(absolute, rel, files);
    else if (entry.isFile()) files.push(rel);
  }
}

/**
 * @param {string} dir
 * @returns {string}
 */
export function writeChecksums(dir) {
  /** @type {string[]} */
  const files = [];
  walkFiles(dir, '', files);
  files.sort();
  if (files.length === 0) throw new Error('air-gap bundle has no files to checksum');
  const lines = files.map((rel) => `${sha256File(path.join(dir, rel))}  ${rel}`);
  const text = `${lines.join('\n')}\n`;
  fs.writeFileSync(path.join(dir, CHECKSUMS_FILE), text);
  return text;
}

/**
 * @param {string} dir
 */
export function verifyChecksums(dir) {
  const file = path.join(dir, CHECKSUMS_FILE);
  if (!fs.existsSync(file)) throw new Error('checksums.txt is missing');
  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('checksums.txt is empty');
  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match || !match[1] || !match[2]) throw new Error(`checksums.txt has a bad line: ${line}`);
    const absolute = path.join(dir, match[2]);
    if (!fs.existsSync(absolute)) throw new Error(`checksummed file is missing: ${match[2]}`);
    if (sha256File(absolute) !== match[1]) throw new Error(`checksum mismatch: ${match[2]}`);
  }
}

/**
 * @param {string} version
 * @returns {string}
 */
export function airgapZipName(version) {
  if (!/^[0-9A-Za-z.-]+$/.test(version)) throw new Error(`bad kit version: ${version}`);
  return `kassis-adk-${version}-airgap.zip`;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function assertPublishAllowed(env) {
  if (env.ADK_KIT_PUBLISH !== '1') {
    throw new Error('Refusing to publish. The release workflow sets ADK_KIT_PUBLISH=1.');
  }
  if (!env.NODE_AUTH_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN is empty. Set the NPM_TOKEN repository secret.');
  }
}
