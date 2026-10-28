/**
 * Clean-room check for the public ADK packages and the addon CLI.
 *
 *   node scripts/adk-clean-room.mjs
 *   node scripts/adk-clean-room.mjs --write-bundle=<dir>
 *   node scripts/adk-clean-room.mjs --airgap --bundle=<dir>
 *
 * The default run uses this repository checkout. It does not deploy, approve,
 * or call a live Kassis instance. adk-core is private and is not packed.
 * --airgap runs only when the bundle directory is already populated. It installs
 * file: tarballs from that bundle and refuses the npm registry.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAddonContentHash } from '../server/core/addon-deployment/addonContentHash.mjs';
import { buildSbom } from '../tools/adk/package-sbom.mjs';
import {
  AIRGAP_TOOLCHAIN,
  PUBLIC_PACKAGE_NAMES,
  assertPopulatedAirgapBundle,
  packPublicPackages,
  runNpm,
  writeAirgapBundle,
} from '../tools/adk/airgap-bundle.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'tools/adk/kassis-addon.mjs');
const bundleCliRelative = 'tools/adk/kassis-addon.mjs';
const SIGNATURE = 'ab'.repeat(32);
const USAGE = `Usage: node scripts/adk-clean-room.mjs [--write-bundle=<dir>]
       node scripts/adk-clean-room.mjs --airgap --bundle=<dir>`;

const IMPORTER = `import { validateManifestV2 } from '@kassis/addon-sdk';
import codes from '@kassis/addon-sdk/codes/kadk-codes.json' with { type: 'json' };
import { assertNoHostImports } from '@kassis/addon-testkit';
import { ADDON_CLI_BIN } from '@kassis/addon-cli';
import { decideAgentAction, withinBudget } from '@kassis/agent-kit';
import { HOST_SDK_VERSION } from '@kassis/host-sdk';
import * as registries from '@kassis/host-sdk/registries';
import * as routes from '@kassis/host-sdk/routes';
import * as entities from '@kassis/host-sdk/entities';
import * as caseWorkspace from '@kassis/host-sdk/caseWorkspace';
import * as i18n from '@kassis/host-sdk/i18n';
import * as risk from '@kassis/host-sdk/risk';
import * as riskLevel from '@kassis/host-sdk/risk-level';
import * as addonUi from '@kassis/addon-ui';

if (typeof validateManifestV2 !== 'function') throw new Error('addon-sdk export missing');
if (validateManifestV2(null).ok !== false) throw new Error('addon-sdk validator accepted null');
if (codes == null || typeof codes !== 'object') throw new Error('kadk codes missing');
assertNoHostImports('const local = 1;');
let rejected = false;
try {
  assertNoHostImports("import x from '@/features/x'");
} catch {
  rejected = true;
}
if (!rejected) throw new Error('addon-testkit accepted a host import');
if (ADDON_CLI_BIN !== 'kassis-addon') throw new Error('addon-cli bin export missing');
if (decideAgentAction({
  hasRun: true,
  runStatus: 'attested',
  finalDecision: true,
  attestationFailures: 0,
  failureThreshold: 1,
  autonomy: 'suggest',
}) !== 'suggest') throw new Error('agent-kit decision mismatch');
if (!withinBudget(1, 1, 3)) throw new Error('agent-kit budget mismatch');
if (HOST_SDK_VERSION !== '0.1.0') throw new Error('host-sdk shim missing HOST_SDK_VERSION');
for (const loaded of [registries, routes, entities, caseWorkspace, i18n, risk, riskLevel, addonUi]) {
  if (loaded == null) throw new Error('shim import failed');
}
process.stdout.write('plain node imports succeeded\\n');
`;

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ stdout: string, stderr: string }}
 */
function run(command, args, cwd, env) {
  const result = spawnSync(command, [...args], {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? 'signal'})\n${stdout}\n${stderr}`.trim());
  }
  return { stdout, stderr };
}

/**
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {{ stdout: string, stderr: string }}
 */
function kassis(args, cwd) {
  return run(process.execPath, [cliPath, ...args], cwd);
}

/**
 * @param {string[]} argv
 * @returns {{ airgap: boolean, bundle: string, writeBundle: string, help: boolean }}
 */
function readArgs(argv) {
  let airgap = false;
  let bundle = '';
  let writeBundle = '';
  let help = false;
  for (const arg of argv) {
    if (arg === '--airgap') airgap = true;
    else if (arg === '--help') help = true;
    else if (arg.startsWith('--bundle=')) bundle = arg.slice('--bundle='.length);
    else if (arg.startsWith('--write-bundle=')) writeBundle = arg.slice('--write-bundle='.length);
    else throw new Error(`Unknown argument ${arg}\n${USAGE}`);
  }
  return { airgap, bundle, writeBundle, help };
}

/**
 * @param {string} installDir
 */
function importRuntime(installDir) {
  fs.writeFileSync(path.join(installDir, 'import.mjs'), IMPORTER);
  const result = run(process.execPath, ['import.mjs'], installDir);
  if (!result.stdout.includes('plain node imports succeeded')) {
    throw new Error(`plain node import did not report success\n${result.stdout}\n${result.stderr}`);
  }
}

/**
 * @param {string} addonDir
 */
function assertTier2Rung2(addonDir) {
  const parsed = JSON.parse(fs.readFileSync(path.join(addonDir, 'manifest.json'), 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('init did not write a manifest object');
  }
  if (parsed.tier !== 2 || parsed.id !== 'acme-clean-room') {
    throw new Error('init did not write tier 2 addon acme-clean-room');
  }
  const ui = 'ui' in parsed ? parsed.ui : null;
  if (ui === null || typeof ui !== 'object' || Array.isArray(ui) || !('entryFile' in ui)) {
    throw new Error('init did not write a rung 2 UI entry');
  }
  if (ui.entryFile !== 'frontend/dist/index.js') {
    throw new Error('init did not set ui.entryFile to frontend/dist/index.js');
  }
  if (!fs.existsSync(path.join(addonDir, 'src/ui/index.ts'))) {
    throw new Error('init did not copy the rung 2 UI source');
  }
}

/**
 * @param {string} text
 */
function assertTestsRan(text) {
  const tests = text.match(/(?:#|ℹ)\s+tests\s+([0-9]+)/);
  const pass = text.match(/(?:#|ℹ)\s+pass\s+([0-9]+)/);
  const testCount = tests && tests[1] !== undefined ? Number(tests[1]) : 0;
  const passCount = pass && pass[1] !== undefined ? Number(pass[1]) : 0;
  if (testCount < 1 || passCount < 1 || passCount !== testCount) {
    throw new Error(`kassis-addon test did not pass\n${text}`);
  }
}

/**
 * @param {Buffer} buffer
 * @returns {string[]}
 */
function zipEntryNames(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw new Error('package zip has no central directory');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  /** @type {string[]} */
  const names = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('package zip central directory is truncated');
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const start = offset + 46;
    const end = start + nameLength;
    if (end > buffer.length) throw new Error('package zip entry name is truncated');
    names.push(buffer.subarray(start, end).toString('utf8'));
    offset = end + extraLength + commentLength;
  }
  return names;
}

/**
 * @param {string} archive
 * @param {boolean} expectUi
 */
function assertPackageZip(archive, expectUi) {
  const names = zipEntryNames(fs.readFileSync(archive));
  if (!names.includes('manifest.json')) throw new Error('package zip is missing manifest.json');
  if (expectUi && !names.some((name) => name === 'frontend/dist' || name.startsWith('frontend/dist/'))) {
    throw new Error(`package zip is missing frontend/dist\n${names.join('\n')}`);
  }
}

/**
 * @param {string} installDir
 * @param {string} bundleDir
 * @param {string} rel
 * @returns {string}
 */
function bundleFileSpecifier(installDir, bundleDir, rel) {
  if (!rel.startsWith('packs/') || rel.includes('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing a bundle path: ${rel}`);
  }
  const absolute = path.resolve(bundleDir, rel);
  const inside = path.relative(path.resolve(bundleDir), absolute);
  if (inside.startsWith('..') || path.isAbsolute(inside)) {
    throw new Error(`Refusing a tarball outside the bundle: ${rel}`);
  }
  let relative = path.relative(installDir, absolute).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `file:${relative}`;
}

/**
 * @param {string} installDir
 * @param {readonly string[]} specifiers
 * @param {string} cacheDir
 */
function installFileTarballs(installDir, specifiers, cacheDir) {
  for (const spec of specifiers) {
    if (!spec.startsWith('file:')) throw new Error(`Refusing a registry install of ${spec}`);
  }
  fs.mkdirSync(installDir, { recursive: true });
  runNpm(
    [
      'install',
      '--no-package-lock',
      '--omit=peer',
      '--legacy-peer-deps',
      '--offline',
      '--no-audit',
      '--no-fund',
      '--cache',
      cacheDir,
      ...specifiers,
    ],
    installDir,
    'pipe',
    {
      npm_config_offline: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    }
  );
}

/**
 * @param {string} addonDir
 */
async function stampSignedFixture(addonDir) {
  fs.writeFileSync(path.join(addonDir, 'sbom.json'), `${JSON.stringify(buildSbom(), null, 2)}\n`);
  const manifestPath = path.join(addonDir, 'manifest.json');
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('manifest.json is not an object');
  }
  const contentHash = await computeAddonContentHash(addonDir);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...parsed, contentHash, signature: SIGNATURE }, null, 2)}\n`
  );
}

/**
 * @param {string} parent
 * @returns {string}
 */
function initTier2Rung2(parent) {
  const addonDir = path.join(parent, 'addon');
  fs.mkdirSync(addonDir, { recursive: true });
  kassis(
    ['init', '--id=clean-room', '--publisher=acme', '--tier=2', '--rung=2', `--dir=${addonDir}`],
    repoRoot
  );
  assertTier2Rung2(addonDir);
  return addonDir;
}

/**
 * @param {string} writeBundle
 */
async function runOnline(writeBundle) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-clean-room-'));
  let passed = false;
  try {
    process.stdout.write('pack public packages\n');
    const tarballs = packPublicPackages(repoRoot, path.join(work, 'packs'));
    const installDir = path.join(work, 'install');
    fs.mkdirSync(installDir);
    process.stdout.write('install tarballs\n');
    runNpm(
      [
        'install',
        '--no-package-lock',
        '--omit=peer',
        '--legacy-peer-deps',
        '--no-audit',
        '--no-fund',
        ...tarballs.map((item) => item.file),
      ],
      installDir
    );
    process.stdout.write('import runtime entries\n');
    importRuntime(installDir);

    process.stdout.write('init tier 2 rung 2\n');
    const addonDir = initTier2Rung2(work);
    process.stdout.write('install addon dependencies\n');
    runNpm(['install', '--no-package-lock', '--no-audit', '--no-fund'], addonDir);
    process.stdout.write('build\n');
    kassis(['build'], addonDir);
    const uiProduced = fs.existsSync(path.join(addonDir, 'frontend', 'dist', 'index.js'));
    if (!uiProduced) throw new Error('rung 2 build did not write frontend/dist/index.js');
    if (!fs.existsSync(path.join(addonDir, 'dist', 'server', 'index.js'))) {
      throw new Error('build did not write dist/server/index.js');
    }

    process.stdout.write('test\n');
    const tested = kassis(['test'], addonDir);
    assertTestsRan(`${tested.stdout}\n${tested.stderr}`);
    process.stdout.write('check\n');
    kassis(['check'], addonDir);
    process.stdout.write('conformance\n');
    kassis(['conformance'], addonDir);

    process.stdout.write('package signed fixture\n');
    await stampSignedFixture(addonDir);
    const packaged = kassis(['package'], addonDir);
    const archive = packaged.stdout.split(/\r?\n/).find((line) => line.endsWith('.addon'));
    if (!archive || !fs.existsSync(archive)) {
      throw new Error(`package did not write an archive\n${packaged.stdout}`);
    }
    assertPackageZip(archive, uiProduced);

    if (writeBundle) {
      process.stdout.write(`write air-gap bundle ${writeBundle}\n`);
      writeAirgapBundle(path.resolve(writeBundle), repoRoot, { tarballs, primeCache: true });
    }
    passed = true;
    process.stdout.write('clean-room passed\n');
  } finally {
    if (passed) fs.rmSync(work, { recursive: true, force: true });
    else process.stderr.write(`clean-room work left at ${work}\n`);
  }
}

/**
 * @param {string} bundleDir
 * @param {Record<string, string>} index
 * @param {readonly string[]} names
 * @param {string} installDir
 * @returns {string[]}
 */
function specifiersFor(bundleDir, index, names, installDir) {
  return names.map((name) => {
    const rel = index[name];
    if (typeof rel !== 'string') throw new Error(`air-gap bundle has no tarball for ${name}`);
    return bundleFileSpecifier(installDir, bundleDir, rel);
  });
}

/**
 * @param {string} addonDir
 * @param {string} bundleDir
 * @param {Record<string, string>} index
 */
function useBundlePackages(addonDir, bundleDir, index) {
  const file = path.join(addonDir, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('addon package.json is not an object');
  }
  const spec = (name) => {
    const rel = index[name];
    if (typeof rel !== 'string') throw new Error(`air-gap bundle has no tarball for ${name}`);
    return bundleFileSpecifier(addonDir, bundleDir, rel);
  };
  parsed.dependencies = {
    '@kassis/addon-sdk': spec('@kassis/addon-sdk'),
    '@kassis/addon-testkit': spec('@kassis/addon-testkit'),
  };
  parsed.devDependencies = {
    '@kassis/addon-cli': spec('@kassis/addon-cli'),
    esbuild: spec('esbuild'),
    typescript: spec('typescript'),
    vite: spec('vite'),
  };
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

/**
 * @param {string} bundleDir
 */
function runAirgap(bundleDir) {
  const resolved = path.resolve(bundleDir);
  const index = assertPopulatedAirgapBundle(resolved);
  const bundleCli = path.join(resolved, bundleCliRelative);
  const help = run(process.execPath, [bundleCli, '--help'], resolved);
  if (!help.stdout.includes('Usage: kassis-addon')) {
    throw new Error('bundle CLI entry did not print help');
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-check-'));
  let passed = false;
  try {
    const cacheDir = path.join(resolved, 'npm-cache');
    const installDir = path.join(work, 'install');
    process.stdout.write('air-gap install\n');
    installFileTarballs(installDir, specifiersFor(resolved, index, PUBLIC_PACKAGE_NAMES, installDir), cacheDir);
    process.stdout.write('air-gap import\n');
    importRuntime(installDir);

    process.stdout.write('air-gap init\n');
    const addonDir = initTier2Rung2(work);
    useBundlePackages(addonDir, resolved, index);
    for (const name of AIRGAP_TOOLCHAIN) {
      if (typeof index[name] !== 'string') throw new Error(`air-gap bundle has no tarball for ${name}`);
    }
    process.stdout.write('air-gap addon install\n');
    installFileTarballs(
      addonDir,
      [
        ...specifiersFor(
          resolved,
          index,
          ['@kassis/addon-sdk', '@kassis/addon-testkit', '@kassis/addon-cli', ...AIRGAP_TOOLCHAIN],
          addonDir
        ),
      ],
      cacheDir
    );
    process.stdout.write('air-gap build\n');
    kassis(['build'], addonDir);
    if (!fs.existsSync(path.join(addonDir, 'dist', 'server', 'index.js'))) {
      throw new Error('air-gap build did not write dist/server/index.js');
    }
    if (!fs.existsSync(path.join(addonDir, 'frontend', 'dist', 'index.js'))) {
      throw new Error('air-gap build did not write frontend/dist/index.js');
    }
    passed = true;
    process.stdout.write('air-gap install and build passed\n');
  } finally {
    if (passed) fs.rmSync(work, { recursive: true, force: true });
    else process.stderr.write(`air-gap work left at ${work}\n`);
  }
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.airgap && args.writeBundle) throw new Error(`--airgap does not write a bundle\n${USAGE}`);
  if (args.airgap) {
    if (!args.bundle) throw new Error(`--airgap requires --bundle=<dir>\n${USAGE}`);
    runAirgap(args.bundle);
    return;
  }
  if (args.bundle) throw new Error(`--bundle is only valid with --airgap\n${USAGE}`);
  await runOnline(args.writeBundle);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'clean-room failed';
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
