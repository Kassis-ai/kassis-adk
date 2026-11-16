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
import { computeAddonContentHash, computeUiContentHash } from '../server/core/addon-deployment/addonContentHash.mjs';
import { resolveManifestTrust } from '../server/core/addon-platform/trust/publisherTrust.mjs';
import {
  AIRGAP_TOOLCHAIN,
  PUBLIC_PACKAGE_NAMES,
  assertPopulatedAirgapBundle,
  packMcpContractTarball,
  packPublicPackages,
  runNpm,
  writeAirgapBundle,
} from '../tools/adk/airgap-bundle.mjs';
import {
  CLEAN_ROOM_SCAFFOLD_REFUSALS,
  CLEAN_ROOM_SCAFFOLD_SUCCESS,
} from './adk-clean-room-scaffold.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
function installedCli(installDir) {
  const bin = path.join(installDir, 'node_modules', '@kassis', 'addon-cli', 'bin', 'kassis-addon.mjs');
  if (!fs.existsSync(bin)) throw new Error('installed kassis-addon bin is missing');
  const resolved = fs.realpathSync(bin);
  const relative = path.relative(repoRoot, resolved);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    throw new Error(`installed CLI resolved inside the repository: ${resolved}`);
  }
  return resolved;
}

function kassis(bin, args, cwd) {
  return run(process.execPath, [bin, ...args], cwd);
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
  if (ui.entryFile !== 'index.js') {
    throw new Error('init did not set ui.entryFile to index.js');
  }
  const npmrc = fs.readFileSync(path.join(addonDir, '.npmrc'), 'utf8');
  if (!npmrc.includes('${NODE_AUTH_TOKEN}')) throw new Error('scaffold .npmrc does not use NODE_AUTH_TOKEN');
  if (/_authToken=(?!\$\{NODE_AUTH_TOKEN\})/.test(npmrc)) throw new Error('scaffold .npmrc contains a token');
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
  const dependencies = { react: '19.3.1', 'react-dom': '19.3.1' };
  for (const spec of specifiers) {
    const base = path.basename(spec.slice('file:'.length));
    dependencies[base.replace(/\.tgz$/, '')] = spec;
  }
  fs.writeFileSync(path.join(installDir, 'package.json'), `${JSON.stringify({ dependencies }, null, 2)}\n`);
  runNpm(
    [
      'install',
      '--no-package-lock',
      '--offline',
      '--no-audit',
      '--no-fund',
      '--cache',
      cacheDir,
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
function jsonResult(stdout) {
  const parsed = JSON.parse(stdout);
  if (parsed === null || typeof parsed !== 'object' || parsed.ok !== true) {
    throw new Error(`command did not return ok\n${stdout}`);
  }
  return parsed.data;
}

/**
 * @param {string} stdout
 * @returns {{ ok: boolean, issues?: Array<{ code?: string }> }}
 */
function parseCliJson(stdout) {
  const line =
    stdout
      .trim()
      .split(/\r?\n/)
      .find((entry) => entry.startsWith('{')) ?? stdout.trim();
  const parsed = JSON.parse(line);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`CLI JSON was not an object\n${stdout}`);
  }
  return parsed;
}

/**
 * @param {string} bin
 * @param {readonly string[]} args
 * @param {string} cwd
 * @returns {{ stdout: string, stderr: string, status: number | null }}
 */
function runCli(bin, args, cwd) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? null,
  };
}

/**
 * @param {string} addonDir
 * @param {Record<string, string>} specs
 */
function alignPackedKassisDeps(addonDir, specs) {
  const file = path.join(addonDir, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('addon package.json is not an object');
  }
  for (const field of ['dependencies', 'devDependencies']) {
    const deps = field in parsed ? parsed[field] : null;
    if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) continue;
    for (const name of Object.keys(deps)) {
      const spec = specs[name];
      if (typeof spec === 'string' && spec.startsWith('file:')) {
        deps[name] = spec;
      }
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

/**
 * @param {string} bin
 * @param {string} parent
 * @param {string} addonDir
 */
function exerciseScaffoldKinds(bin, parent, addonDir) {
  process.stdout.write('scaffold kinds\n');
  for (const item of CLEAN_ROOM_SCAFFOLD_SUCCESS) {
    const ran = runCli(
      bin,
      ['scaffold', `--kind=${item.kind}`, `--name=${item.name}`, `--dir=${addonDir}`, '--json'],
      parent
    );
    if (ran.status !== 0) {
      throw new Error(
        `scaffold ${item.kind} ${item.name} failed (${ran.status ?? 'signal'})\n${ran.stdout}\n${ran.stderr}`.trim()
      );
    }
    const parsed = parseCliJson(ran.stdout);
    if (parsed.ok !== true) {
      throw new Error(`scaffold ${item.kind} ${item.name} did not return ok\n${ran.stdout}`);
    }
  }
  for (const item of CLEAN_ROOM_SCAFFOLD_REFUSALS) {
    const ran = runCli(
      bin,
      ['scaffold', `--kind=${item.kind}`, `--name=${item.name}`, `--dir=${addonDir}`, '--json'],
      parent
    );
    if (ran.status === 0) {
      throw new Error(`scaffold ${item.kind} should refuse for tier 2\n${ran.stdout}`);
    }
    const parsed = parseCliJson(ran.stdout);
    if (parsed.ok !== false) {
      throw new Error(`scaffold ${item.kind} should return ok=false\n${ran.stdout}`);
    }
    const codes = Array.isArray(parsed.issues)
      ? parsed.issues.map((issue) => (issue && typeof issue.code === 'string' ? issue.code : ''))
      : [];
    if (!codes.includes(item.code)) {
      throw new Error(`scaffold ${item.kind} should emit ${item.code}; got ${codes.join(', ')}\n${ran.stdout}`);
    }
  }
}

function fillAttestation(addonDir) {
  const file = path.join(addonDir, '.kassis', 'attestation.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.answers)) throw new Error('attestation has no answers');
  parsed.answers = parsed.answers.map((answer) => ({ ...answer, outcome: 'followed', note: 'clean room' }));
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

function usePackedDependencies(addonDir, specs) {
  const file = path.join(addonDir, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  parsed.dependencies = {
    ...(parsed.dependencies ?? {}),
    '@kassis/addon-sdk': specs['@kassis/addon-sdk'],
    '@kassis/addon-testkit': specs['@kassis/addon-testkit'],
  };
  parsed.devDependencies = {
    ...(parsed.devDependencies ?? {}),
    '@kassis/addon-cli': specs['@kassis/addon-cli'],
  };
  for (const name of AIRGAP_TOOLCHAIN) {
    if (specs[name]) parsed.devDependencies[name] = specs[name];
  }
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function verifyClientPackage(addonDir, archive, publicKey, fingerprint) {
  const manifest = JSON.parse(fs.readFileSync(path.join(addonDir, 'manifest.json'), 'utf8'));
  const snapshot = {
    publishers: [
      {
        id: 'acme',
        displayName: 'Acme',
        allowedTiers: [2],
        idPrefixes: ['acme-'],
        status: 'active',
      },
    ],
    keys: [
      {
        fingerprint,
        publisherId: 'acme',
        publicKeyDerHex: publicKey,
        status: 'current',
        notBefore: null,
        notAfter: null,
      },
    ],
  };
  resolveManifestTrust(manifest, snapshot, '');
  const contentHash = await computeAddonContentHash(addonDir);
  if (contentHash !== manifest.contentHash) throw new Error('contentHash does not match the signed manifest');
  const uiContentHash = await computeUiContentHash(addonDir);
  if (!uiContentHash || uiContentHash !== manifest.uiContentHash) {
    throw new Error('uiContentHash does not match frontend/dist');
  }
  const checks = JSON.parse(fs.readFileSync(path.join(addonDir, '.kassis', 'evidence', 'checks.json'), 'utf8'));
  if (checks.contentHash !== manifest.contentHash) throw new Error('evidence contentHash does not match the manifest');
  const names = zipEntryNames(fs.readFileSync(archive));
  if (!names.includes('sbom.json')) throw new Error('package zip is missing sbom.json');
  if (!names.includes('evidence/checks.json')) throw new Error('package zip is missing evidence/checks.json');
  if (!names.includes('evidence/attestation.json')) throw new Error('package zip is missing evidence/attestation.json');
  if (!names.includes('evidence/agent-profile.lock.json')) {
    throw new Error('package zip is missing evidence/agent-profile.lock.json');
  }
  const sbom = JSON.parse(fs.readFileSync(path.join(addonDir, 'sbom.json'), 'utf8'));
  const componentNames = Array.isArray(sbom.components) ? sbom.components.map((item) => item.name) : [];
  if (!componentNames.includes('@kassis/addon-sdk')) {
    throw new Error(`SBOM does not list the addon dependency\n${componentNames.join(', ')}`);
  }
}

/**
 * @param {string} bin
 * @param {string} parent
 * @param {Record<string, string>} specs
 * @param {{ offline?: boolean, cacheDir?: string }} [options]
 */
async function exerciseClient(bin, parent, specs, options = {}) {
  const generated = jsonResult(kassis(bin, ['keys', 'generate', '--publisher=acme', '--json'], parent).stdout);
  const addonDir = path.join(parent, 'addon');
  fs.mkdirSync(addonDir, { recursive: true });
  kassis(
    bin,
    ['init', '--id=clean-room', '--publisher=acme', '--tier=2', '--rung=3', `--dir=${addonDir}`],
    parent
  );
  assertTier2Rung2(addonDir);
  if (!fs.existsSync(path.join(addonDir, 'migrations'))) throw new Error('rung 3 did not copy migrations');
  usePackedDependencies(addonDir, specs);
  const installArgs = ['install', '--no-package-lock', '--no-audit', '--no-fund'];
  const env = {};
  if (options.offline) {
    installArgs.push('--offline', '--cache', options.cacheDir ?? '');
    env.npm_config_offline = 'true';
  }
  runNpm(installArgs, addonDir, 'pipe', env);
  exerciseScaffoldKinds(bin, parent, addonDir);
  alignPackedKassisDeps(addonDir, specs);
  runNpm(installArgs, addonDir, 'pipe', env);
  kassis(bin, ['build'], addonDir);
  if (!fs.existsSync(path.join(addonDir, 'dist', 'server', 'index.js'))) {
    throw new Error('build did not write dist/server/index.js');
  }
  if (!fs.existsSync(path.join(addonDir, 'frontend', 'dist', 'index.js'))) {
    throw new Error('build did not write frontend/dist/index.js');
  }
  const tested = kassis(bin, ['test'], addonDir);
  assertTestsRan(`${tested.stdout}\n${tested.stderr}`);
  kassis(bin, ['check'], addonDir);
  kassis(bin, ['conformance'], addonDir);
  kassis(bin, ['sync'], addonDir);
  kassis(bin, ['attest'], addonDir);
  fillAttestation(addonDir);
  kassis(bin, ['sbom'], addonDir);
  kassis(bin, ['certify'], addonDir);
  kassis(bin, ['sign', `--key=${generated.file}`], addonDir);
  const packaged = kassis(bin, ['package'], addonDir);
  const archive = packaged.stdout.split(/\r?\n/).find((line) => line.endsWith('.addon'));
  if (!archive || !fs.existsSync(archive)) throw new Error(`package did not write an archive\n${packaged.stdout}`);
  await verifyClientPackage(addonDir, archive, generated.publicKey, generated.fingerprint);
}

/**
 * @param {string} writeBundle
 */
function fileSpec(file) {
  return `file:${path.resolve(file).split(path.sep).join('/')}`;
}

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
      ['install', '--no-package-lock', '--no-audit', '--no-fund', ...tarballs.map((item) => item.file)],
      installDir
    );
    process.stdout.write('import runtime entries\n');
    importRuntime(installDir);
    process.stdout.write('publish dry-run\n');
    for (const item of tarballs) {
      const pkgDir = path.join(repoRoot, 'packages', item.name.replace('@kassis/', ''));
      runNpm(['publish', '--dry-run'], pkgDir);
    }
    const mcpTarball = packMcpContractTarball(repoRoot, path.join(work, 'packs'));
    const specs = Object.fromEntries(tarballs.map((item) => [item.name, fileSpec(item.file)]));
    specs['@kassis/mcp-contract'] = fileSpec(mcpTarball.file);
    process.stdout.write('client flow\n');
    await exerciseClient(installedCli(installDir), work, specs);
    if (writeBundle) {
      process.stdout.write(`write air-gap bundle ${writeBundle}\n`);
      writeAirgapBundle(path.resolve(writeBundle), repoRoot, {
        tarballs: [...tarballs, mcpTarball],
        primeCache: true,
      });
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
async function runAirgap(bundleDir) {
  const resolved = path.resolve(bundleDir);
  const index = assertPopulatedAirgapBundle(resolved);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-airgap-check-'));
  let passed = false;
  try {
    const cacheDir = path.join(resolved, 'npm-cache');
    const installDir = path.join(work, 'install');
    process.stdout.write('air-gap install\n');
    const names = [
      '@kassis/addon-sdk',
      '@kassis/addon-testkit',
      '@kassis/addon-cli',
      '@kassis/mcp-contract',
      ...AIRGAP_TOOLCHAIN,
    ];
    const dependencies = {};
    for (const name of names) {
      const rel = index[name];
      if (typeof rel !== 'string') {
        if (name === '@kassis/mcp-contract') {
          throw new Error('air-gap bundle has no tarball for @kassis/mcp-contract (rebuild bundle after S1.20)');
        }
        throw new Error(`air-gap bundle has no tarball for ${name}`);
      }
      dependencies[name] = fileSpec(path.join(resolved, rel));
    }
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, 'package.json'), `${JSON.stringify({ dependencies }, null, 2)}\n`);
    runNpm(
      ['install', '--no-package-lock', '--offline', '--no-audit', '--no-fund', '--cache', cacheDir],
      installDir,
      'pipe',
      { npm_config_offline: 'true' }
    );
    const specs = { ...dependencies };
    process.stdout.write('air-gap client flow\n');
    await exerciseClient(installedCli(installDir), work, specs, { offline: true, cacheDir });
    passed = true;
    process.stdout.write('air-gap client flow passed\n');
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
    await runAirgap(args.bundle);
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
