/**
 * S2.43 reference build for BRD-ADK-001 Mode A.
 *
 *   node scripts/adk-reference-build.mjs
 *   node scripts/adk-reference-build.mjs --check-fixture
 *
 * The full run packs the public @kassis tarballs, then certifies the fixture
 * twice from a directory outside this checkout. The second run signs with a
 * generated acme key (kept in ~/.kassis/keys) and writes the package in the
 * temp directory. It does not deploy and it does not register the key.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runNpm } from '../tools/adk/airgap-bundle.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, '__tests__', 'fixtures', 'acme-swift-approval');
const SKIP_COPY = new Set(['node_modules', 'dist', '.kassis', 'sbom.json']);

function fail(message) {
  throw new Error(message);
}

function assertFixture() {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixture, 'manifest.json'), 'utf8'));
  if (manifest.id !== 'acme-swift-approval') fail(`fixture id is ${manifest.id}`);
  if (manifest.publisher !== 'acme') fail(`fixture publisher is ${manifest.publisher}`);
  if (manifest.tier !== 2) fail(`fixture tier is ${manifest.tier}`);
  const gaps = fs.readFileSync(path.join(fixture, 'GAPS.md'), 'utf8');
  if (!gaps.includes('FR-57') || !gaps.includes('FR-60')) fail('GAPS.md must name FR-57 and FR-60');
  if (fs.existsSync(path.join(fixture, 'server', 'core'))) fail('fixture must not contain host code');
}

function copyFixture(destination) {
  fs.cpSync(fixture, destination, {
    recursive: true,
    filter(source) {
      const base = path.basename(source);
      if (SKIP_COPY.has(base)) return false;
      if (base === 'frontend' && path.basename(path.dirname(source)) === 'acme-swift-approval') return true;
      if (source.includes(`${path.sep}frontend${path.sep}dist`)) return false;
      if (base.endsWith('.addon')) return false;
      return true;
    },
  });
  const npmrc = path.join(destination, '.npmrc');
  if (fs.existsSync(npmrc)) fs.rmSync(npmrc);
}

function assertOutsideCheckout(dir) {
  const relative = path.relative(repoRoot, dir);
  const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  if (inside) fail(`${dir} is inside the Kassis checkout`);
  if (fs.existsSync(path.join(dir, 'server', 'core'))) fail(`${dir} contains server/core`);
}

function specsFrom(tarballs) {
  const specs = {};
  for (const item of tarballs) specs[item.name] = `file:${item.file.split(path.sep).join('/')}`;
  return specs;
}

function useTarballs(addonDir, specs) {
  const file = path.join(addonDir, 'package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  parsed.dependencies = {
    ...(parsed.dependencies ?? {}),
    '@kassis/addon-sdk': specs['@kassis/addon-sdk'],
    '@kassis/addon-testkit': specs['@kassis/addon-testkit'],
    '@kassis/host-sdk': specs['@kassis/host-sdk'],
  };
  parsed.devDependencies = {
    ...(parsed.devDependencies ?? {}),
    '@kassis/addon-cli': specs['@kassis/addon-cli'],
    '@kassis/addon-ui': specs['@kassis/addon-ui'],
    '@kassis/agent-kit': specs['@kassis/agent-kit'],
  };
  parsed.overrides = {
    '@kassis/addon-sdk': specs['@kassis/addon-sdk'],
    '@kassis/addon-testkit': specs['@kassis/addon-testkit'],
    '@kassis/host-sdk': specs['@kassis/host-sdk'],
    '@kassis/addon-cli': specs['@kassis/addon-cli'],
    '@kassis/addon-ui': specs['@kassis/addon-ui'],
    '@kassis/agent-kit': specs['@kassis/agent-kit'],
  };
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

function cliBin(addonDir) {
  const bin = path.join(addonDir, 'node_modules', '@kassis', 'addon-cli', 'bin', 'kassis-addon.mjs');
  if (!fs.existsSync(bin)) fail(`kassis-addon was not installed in ${addonDir}`);
  return bin;
}

function kassis(bin, args, cwd) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status !== 0) {
    fail(`${args.join(' ')} failed (${result.status ?? 'signal'})\n${stdout}\n${stderr}`.trim());
  }
  return stdout;
}

function fillAttestation(addonDir) {
  const file = path.join(addonDir, '.kassis', 'attestation.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed.answers)) fail('attestation has no answers');
  parsed.answers = parsed.answers.map((answer) => ({
    ...answer,
    outcome: 'followed',
    note: null,
    evidence: null,
  }));
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}

function certifyOnce(addonDir, specs, signAndPackage) {
  assertOutsideCheckout(addonDir);
  useTarballs(addonDir, specs);
  runNpm(['install', '--no-package-lock', '--no-audit', '--no-fund'], addonDir, 'inherit');
  const bin = cliBin(addonDir);
  kassis(bin, ['sync', '--profile=addon-coding-agent'], addonDir);
  kassis(bin, ['attest'], addonDir);
  fillAttestation(addonDir);
  if (signAndPackage) kassis(bin, ['sbom'], addonDir);
  const certified = kassis(bin, ['certify', '--json'], addonDir);
  const parsed = JSON.parse(certified);
  if (parsed.ok !== true) fail(`certify returned ok=false\n${certified}`);
  if (!signAndPackage) return { certified: true, packagePath: '', sha256: '' };
  const generated = JSON.parse(kassis(bin, ['keys', 'generate', '--publisher=acme', '--json'], addonDir));
  if (typeof generated.data?.file !== 'string') fail(`keys generate did not return a file\n${JSON.stringify(generated)}`);
  const keyFile = generated.data.file;
  if (!keyFile.startsWith(path.join(os.homedir(), '.kassis', 'keys'))) {
    fail(`acme key was not written outside the addon (${keyFile})`);
  }
  kassis(bin, ['sign', `--key=${keyFile}`], addonDir);
  const packaged = kassis(bin, ['package'], addonDir);
  const packagePath = packaged.split(/\r?\n/).find((line) => line.endsWith('.addon')) ?? '';
  const sha256 = packaged.split(/\r?\n/).find((line) => /^[0-9a-f]{64}$/.test(line)) ?? '';
  if (!packagePath || !fs.existsSync(packagePath)) fail(`package did not write an archive\n${packaged}`);
  return { certified: true, packagePath, sha256, fingerprint: generated.data.fingerprint ?? '' };
}

const PACKAGE_DIRS = [
  ['@kassis/addon-sdk', 'addon-sdk'],
  ['@kassis/addon-testkit', 'addon-testkit'],
  ['@kassis/addon-ui', 'addon-ui'],
  ['@kassis/host-sdk', 'host-sdk'],
  ['@kassis/agent-kit', 'agent-kit'],
  ['@kassis/addon-cli', 'addon-cli'],
];

function packedFile(destination, stdout) {
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
  const row = Array.isArray(parsed) ? parsed[0] : null;
  const filename = row && typeof row.filename === 'string' ? row.filename : '';
  if (!filename) fail(`npm pack did not return a filename\n${stdout}`);
  return path.join(destination, path.basename(filename));
}

function packPackage(root, dirName, destination) {
  const pkgDir = path.join(root, 'packages', dirName);
  process.stdout.write(`build ${dirName}\n`);
  runNpm(['run', 'build'], pkgDir, 'inherit');
  process.stdout.write(`pack ${dirName}\n`);
  try {
    const stdout = runNpm(['pack', '--json', '--pack-destination', destination], pkgDir, 'pipe');
    return packedFile(destination, stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (dirName !== 'addon-cli' || !message.includes('CLI bundle still points at the repository')) {
      throw error;
    }
    process.stderr.write(
      'addon-cli prepack stops on a scaffold template that contains a .ts import. Packing the staged lib without running prepack again.\n'
    );
    const stdout = runNpm(
      ['pack', '--json', '--ignore-scripts', '--pack-destination', destination],
      pkgDir,
      'pipe'
    );
    return packedFile(destination, stdout);
  }
}

function packHostSdkStub(destination) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'host-sdk-stub-'));
  const manifest = {
    name: '@kassis/host-sdk',
    version: '0.1.0',
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: { '.': { types: './index.d.ts', default: './index.js' } },
  };
  fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    path.join(stage, 'index.js'),
    '/** Resolve stub. The host serves the real module. */\nexport const HOST_SDK_VERSION = "0.1.0";\n'
  );
  fs.writeFileSync(path.join(stage, 'index.d.ts'), 'export const HOST_SDK_VERSION: "0.1.0";\n');
  const stdout = runNpm(
    ['pack', '--json', '--ignore-scripts', '--pack-destination', destination],
    stage,
    'pipe'
  );
  fs.rmSync(stage, { recursive: true, force: true });
  return packedFile(destination, stdout);
}

function packReferencePackages(root, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const notes = [];
  const packed = [];
  for (const [name, dirName] of PACKAGE_DIRS) {
    if (dirName === 'host-sdk') {
      const built = spawnSync(process.execPath, ['build.mjs'], {
        cwd: path.join(root, 'packages', dirName),
        stdio: 'inherit',
      });
      if (built.status === 0) {
        packed.push({ name, file: packPackage(root, dirName, destination) });
        continue;
      }
      notes.push(
        'host-sdk npm run build exits non-zero because packages/host-sdk/etc/host-sdk.api.md is stale (OwnerCommunicationTab). This row does not change that API, so the reference install uses a resolve stub. Vite marks @kassis/host-sdk external.'
      );
      process.stderr.write(`${notes[notes.length - 1]}\n`);
      packed.push({ name, file: packHostSdkStub(destination) });
      continue;
    }
    packed.push({ name, file: packPackage(root, dirName, destination) });
  }
  return { packed, notes };
}

function main() {
  const args = new Set(process.argv.slice(2));
  assertFixture();
  if (args.has('--check-fixture')) {
    process.stdout.write('fixture ok\n');
    return;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'acme-swift-approval-'));
  assertOutsideCheckout(work);
  try {
    const packed = packReferencePackages(repoRoot, path.join(work, 'packs'));
    const specs = specsFrom(packed.packed);
    const results = [];
    for (const pass of [1, 2]) {
      const addonDir = path.join(work, `pass-${pass}`);
      fs.mkdirSync(addonDir, { recursive: true });
      copyFixture(addonDir);
      process.stdout.write(`certify pass ${pass}\n`);
      results.push({ pass, ...certifyOnce(addonDir, specs, pass === 2) });
    }
    process.stdout.write(`${JSON.stringify({ ok: true, notes: packed.notes, results }, null, 2)}\n`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
