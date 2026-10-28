/**
 * Air-gap bundle: SDK, testkit, template, public verification key, SBOM,
 * the six public package tarballs, adk-core sources, the CLI entry
 * tools/adk/kassis-addon.mjs, and checksums.txt.
 * There is no separate CLI binary. The private signing key is not included.
 *
 *   node tools/adk/airgap-bundle.mjs --out=<dir>
 *
 * That command builds and packs the six public packages (network is allowed)
 * and fills npm-cache so a later offline install can refuse the registry.
 * Passing tarballs to writeAirgapBundle skips that build.
 */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSbom } from './package-sbom.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COPY_ROOTS = [
  'packages/addon-sdk',
  'packages/addon-testkit',
  'packages/adk-core',
  'tools/adk',
  'templates/kassis-addon',
];

const PUBLIC_PACKAGE_DIRS = [
  'addon-sdk',
  'addon-testkit',
  'addon-ui',
  'host-sdk',
  'agent-kit',
  'addon-cli',
];

/** @type {readonly string[]} */
export const PUBLIC_PACKAGE_NAMES = [
  '@kassis/addon-sdk',
  '@kassis/addon-testkit',
  '@kassis/addon-ui',
  '@kassis/host-sdk',
  '@kassis/agent-kit',
  '@kassis/addon-cli',
];

/** Names an offline addon build installs from the bundle, in addition to the six. */
export const AIRGAP_TOOLCHAIN = ['esbuild', 'typescript', 'vite'];

const CLI_RELATIVE = 'tools/adk/kassis-addon.mjs';

/**
 * @typedef {{ name: string, file: string }} PackedTarball
 * @typedef {{ tarballs?: readonly PackedTarball[], primeCache?: boolean }} AirgapOptions
 */

/**
 * Runs npm by executing its cli script with node. Spawning npm.cmd on Windows
 * fails with EINVAL, and a shell would split paths that contain spaces.
 * @param {string[]} args
 * @param {string} cwd
 * @param {'pipe' | 'inherit'} [stdio]
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
function npmInvocation() {
  const fromEnv = process.env.npm_execpath;
  if (fromEnv && fs.existsSync(fromEnv)) return { command: process.execPath, prefix: [fromEnv] };
  const lookup = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['npm'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const hit = (lookup.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && fs.existsSync(line));
  if (hit) {
    const sibling = path.join(path.dirname(hit), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(sibling)) return { command: process.execPath, prefix: [sibling] };
    if (!hit.endsWith('.cmd') && !hit.endsWith('.ps1')) return { command: hit, prefix: [] };
  }
  const beside = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(beside)) return { command: process.execPath, prefix: [beside] };
  throw new Error('npm was not found on PATH or next to node');
}

export function runNpm(args, cwd, stdio = 'pipe', env) {
  const npm = npmInvocation();
  const result = spawnSync(npm.command, [...npm.prefix, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    stdio,
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = stdio === 'pipe' ? `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() : '';
    throw new Error(`npm ${args.join(' ')} failed (${result.status ?? 'signal'})${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout ?? '';
}

/**
 * @param {string} stdout
 * @returns {string}
 */
function packFilename(stdout) {
  let end = stdout.lastIndexOf(']');
  let parsed = null;
  while (end >= 0 && parsed === null) {
    let start = stdout.lastIndexOf('[', end);
    while (start >= 0) {
      try {
        const candidate = JSON.parse(stdout.slice(start, end + 1));
        if (Array.isArray(candidate) && candidate.length > 0) {
          parsed = candidate;
          break;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      start = stdout.lastIndexOf('[', start - 1);
    }
    end = stdout.lastIndexOf(']', end - 1);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`npm pack did not return JSON\n${stdout}`);
  const first = parsed[0];
  if (first === null || typeof first !== 'object' || !('filename' in first) || typeof first.filename !== 'string') {
    throw new Error('npm pack JSON has no filename');
  }
  return first.filename;
}

/**
 * @param {string} destination
 * @param {string} filename
 * @returns {string}
 */
function packedFile(destination, filename) {
  const base = path.basename(filename);
  const inDest = path.join(destination, base);
  if (fs.existsSync(inDest)) return inDest;
  if (fs.existsSync(filename)) return filename;
  throw new Error(`npm pack did not write ${base}`);
}

/**
 * @param {string} pkgDir
 * @returns {string}
 */
function packageName(pkgDir) {
  const parsed = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${pkgDir} package.json is not an object`);
  }
  if (!('name' in parsed) || typeof parsed.name !== 'string') {
    throw new Error(`${pkgDir} package.json has no name`);
  }
  return parsed.name;
}

/**
 * @param {string} spec
 * @returns {string}
 */
function packageNameFromSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`Not a package spec: ${spec}`);
  return spec.slice(0, at);
}

/**
 * Build and npm pack the six public packages. adk-core stays private.
 * @param {string} root
 * @param {string} destination
 * @returns {PackedTarball[]}
 */
export function packPublicPackages(root, destination) {
  fs.mkdirSync(destination, { recursive: true });
  /** @type {PackedTarball[]} */
  const packed = [];
  for (const dirName of PUBLIC_PACKAGE_DIRS) {
    const pkgDir = path.join(root, 'packages', dirName);
    process.stdout.write(`build ${dirName}\n`);
    runNpm(['run', 'build'], pkgDir, 'inherit');
    process.stdout.write(`pack ${dirName}\n`);
    const stdout = runNpm(['pack', '--json', '--pack-destination', destination], pkgDir, 'pipe');
    const tarball = packedFile(destination, packFilename(stdout));
    const name = packageName(pkgDir);
    if (!PUBLIC_PACKAGE_NAMES.includes(name)) {
      throw new Error(`${dirName} packed as ${name}, which is not a public package`);
    }
    packed.push({ name, file: tarball });
  }
  if (packed.length !== PUBLIC_PACKAGE_NAMES.length) {
    throw new Error(`expected ${PUBLIC_PACKAGE_NAMES.length} tarballs, found ${packed.length}`);
  }
  return packed;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function toolchainSpecs(root) {
  const file = path.join(root, 'templates/kassis-addon/package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('templates/kassis-addon/package.json is not an object');
  }
  const devDependencies = 'devDependencies' in parsed ? parsed.devDependencies : null;
  if (devDependencies === null || typeof devDependencies !== 'object' || Array.isArray(devDependencies)) {
    return [];
  }
  /** @type {string[]} */
  const specs = [];
  for (const [name, range] of Object.entries(devDependencies)) {
    if (name.startsWith('@kassis/')) continue;
    if (typeof range !== 'string' || range.startsWith('file:')) continue;
    specs.push(`${name}@${range}`);
  }
  return specs;
}

/**
 * @param {string} spec
 * @param {string} destination
 * @returns {string}
 */
function packSpec(spec, destination) {
  fs.mkdirSync(destination, { recursive: true });
  process.stdout.write(`pack ${spec}\n`);
  const stdout = runNpm(['pack', spec, '--json', '--pack-destination', destination], destination, 'pipe');
  return packedFile(destination, packFilename(stdout));
}

/**
 * @param {string} outDir
 * @param {Record<string, string>} index
 */
function primeNpmCache(outDir, index) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-prime-'));
  try {
    const specs = Object.values(index).map((rel) => {
      const absolute = path.resolve(outDir, rel).split(path.sep).join('/');
      return `file:${absolute}`;
    });
    fs.rmSync(path.join(outDir, 'npm-cache'), { recursive: true, force: true });
    process.stdout.write('prime air-gap npm cache\n');
    runNpm(
      [
        'install',
        '--no-package-lock',
        '--no-audit',
        '--no-fund',
        '--cache',
        path.join(outDir, 'npm-cache'),
        'react@19.2.3',
        ...specs,
      ],
      work,
      'inherit'
    );
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

/**
 * @param {string} dir
 * @param {string} prefix
 * @param {string[]} files
 */
function walkFiles(dir, prefix, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (prefix === '' && (entry.name === 'checksums.txt' || entry.name === 'npm-cache')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walkFiles(absolute, rel, files);
    else if (entry.isFile()) files.push(rel);
  }
}

/**
 * @param {string} file
 * @returns {string}
 */
function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * @param {string} outDir
 */
function writeChecksums(outDir) {
  /** @type {string[]} */
  const files = [];
  walkFiles(outDir, '', files);
  files.sort();
  const lines = files.map((rel) => `${sha256File(path.join(outDir, rel))}  ${rel}`);
  fs.writeFileSync(path.join(outDir, 'checksums.txt'), `${lines.join('\n')}\n`);
}

/**
 * @param {string} outDir
 */
function refusePrivateKey(outDir) {
  const privateKey = path.join(outDir, 'server/keys/addon_signing_private.key');
  if (fs.existsSync(privateKey)) {
    throw new Error('Air-gap bundle included the private signing key');
  }
}

/**
 * @param {string} outDir
 * @param {string} [root]
 * @param {AirgapOptions} [options]
 * @returns {string}
 */
export function writeAirgapBundle(outDir, root = repoRoot, options = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const relative of COPY_ROOTS) {
    copyTree(path.join(root, relative), path.join(outDir, relative));
  }
  const cliSource = path.join(root, CLI_RELATIVE);
  if (!fs.existsSync(cliSource)) throw new Error(`CLI entry is missing: ${CLI_RELATIVE}`);
  fs.copyFileSync(cliSource, path.join(outDir, CLI_RELATIVE));
  const keyOut = path.join(outDir, 'keys');
  fs.mkdirSync(keyOut, { recursive: true });
  fs.copyFileSync(
    path.join(root, 'server/keys/addon_verification_public.key'),
    path.join(keyOut, 'addon_verification_public.key')
  );
  fs.writeFileSync(path.join(outDir, 'sbom.json'), `${JSON.stringify(buildSbom(root), null, 2)}\n`);

  const packs = path.join(outDir, 'packs');
  fs.rmSync(packs, { recursive: true, force: true });
  fs.mkdirSync(packs, { recursive: true });
  /** @type {Record<string, string>} */
  const index = {};
  for (const item of options.tarballs ?? []) {
    if (!item.file.endsWith('.tgz')) throw new Error(`not a tarball: ${item.file}`);
    if (!fs.existsSync(item.file)) throw new Error(`tarball is missing: ${item.file}`);
    const base = path.basename(item.file);
    const rel = `packs/${base}`;
    fs.copyFileSync(item.file, path.join(outDir, rel));
    index[item.name] = rel;
  }
  if (options.primeCache) {
    for (const name of PUBLIC_PACKAGE_NAMES) {
      if (!index[name]) throw new Error(`Cannot prime the air-gap cache without ${name}`);
    }
    for (const spec of toolchainSpecs(root)) {
      const name = packageNameFromSpec(spec);
      const file = packSpec(spec, packs);
      index[name] = `packs/${path.basename(file)}`;
    }
    primeNpmCache(outDir, index);
  }
  fs.writeFileSync(path.join(packs, 'index.json'), `${JSON.stringify({ packages: index }, null, 2)}\n`);
  refusePrivateKey(outDir);
  writeChecksums(outDir);
  return outDir;
}

/**
 * @param {string} bundleDir
 */
export function verifyAirgapChecksums(bundleDir) {
  const file = path.join(bundleDir, 'checksums.txt');
  if (!fs.existsSync(file)) throw new Error('checksums.txt is missing');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('checksums.txt is empty');
  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match || match[1] === undefined || match[2] === undefined) {
      throw new Error(`checksums.txt has a bad line: ${line}`);
    }
    const rel = match[2];
    const absolute = path.join(bundleDir, rel);
    if (!fs.existsSync(absolute)) throw new Error(`checksummed file is missing: ${rel}`);
    if (sha256File(absolute) !== match[1]) throw new Error(`checksum mismatch: ${rel}`);
  }
}

/**
 * @param {string} bundleDir
 * @returns {Record<string, string>}
 */
function readPackIndex(bundleDir) {
  const parsed = JSON.parse(fs.readFileSync(path.join(bundleDir, 'packs/index.json'), 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || !('packages' in parsed)) {
    throw new Error('packs/index.json is not a package index');
  }
  const packages = parsed.packages;
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new Error('packs/index.json is not a package index');
  }
  /** @type {Record<string, string>} */
  const index = {};
  for (const [name, rel] of Object.entries(packages)) {
    if (typeof rel !== 'string') throw new Error(`packs/index.json entry ${name} is not a path`);
    index[name] = rel;
  }
  return index;
}

/**
 * Require a bundle that already contains the six tarballs, adk-core, the CLI, checksums, and the offline cache.
 * @param {string} bundleDir
 * @returns {Record<string, string>}
 */
export function assertPopulatedAirgapBundle(bundleDir) {
  if (!fs.existsSync(bundleDir)) throw new Error('Air-gap bundle directory is not populated');
  verifyAirgapChecksums(bundleDir);
  for (const rel of [CLI_RELATIVE, 'packages/adk-core/src/index.ts', 'packs/index.json', 'npm-cache']) {
    if (!fs.existsSync(path.join(bundleDir, rel))) {
      throw new Error(`Air-gap bundle is not populated: missing ${rel}`);
    }
  }
  const index = readPackIndex(bundleDir);
  for (const name of [...PUBLIC_PACKAGE_NAMES, ...AIRGAP_TOOLCHAIN]) {
    const rel = index[name];
    if (typeof rel !== 'string' || !rel.startsWith('packs/') || rel.includes('..')) {
      throw new Error(`Air-gap bundle is not populated: missing tarball for ${name}`);
    }
    if (!fs.existsSync(path.join(bundleDir, rel))) {
      throw new Error(`Air-gap bundle is not populated: missing tarball for ${name}`);
    }
  }
  return index;
}

function main() {
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  if (!outArg) {
    console.error('Usage: node tools/adk/airgap-bundle.mjs --out=<dir>');
    process.exit(1);
  }
  const outDir = path.resolve(outArg.slice('--out='.length));
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-pack-'));
  try {
    const tarballs = packPublicPackages(repoRoot, path.join(staging, 'packs'));
    console.log(writeAirgapBundle(outDir, repoRoot, { tarballs, primeCache: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'air-gap bundle failed';
    console.error(message);
    process.exit(1);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
