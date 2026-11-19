/**
 * ADK kit release commands used by .github/workflows/adk-release.yml.
 * Does not push tags. publish runs only when ADK_KIT_PUBLISH=1.
 *
 *   node tools/release/adk-kit-release.mjs check-tag --tag=adk/v0.1.0
 *   node tools/release/adk-kit-release.mjs build
 *   node tools/release/adk-kit-release.mjs test
 *   node tools/release/adk-kit-release.mjs pack --out=dist/adk-airgap --source-sha=<sha>
 *   node tools/release/adk-kit-release.mjs checksums --dir=dist/adk-airgap
 *   node tools/release/adk-kit-release.mjs archive --dir=dist/adk-airgap
 *   node tools/release/adk-kit-release.mjs publish --dir=dist/adk-airgap
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpm } from '../adk/airgap-bundle.mjs';
import {
  INDEX_FILE,
  KIT_UNIT_GLOBS,
  PUBLIC_KEY_FILE,
  SBOM_FILE,
  airgapZipName,
  assertGroupVersion,
  assertPublishAllowed,
  buildKitSbom,
  kitFixedGroup,
  packFilename,
  resolveKitPackages,
  sha256File,
  versionFromAdkTag,
  verifyChecksums,
  writeChecksums,
} from './adkKitReleaseLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VITEST_CONFIG = '__tests__/config/vitest.workspace.js';

/** @param {string} name @returns {string} */
function flag(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

/** @returns {{ name: string, dir: string, version: string, dependencies: string[] }[]} */
function loadPackages() {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, '.changeset/config.json'), 'utf8'));
  return resolveKitPackages(repoRoot, kitFixedGroup(config));
}

/** @param {string} target */
function assertInsideRepo(target) {
  const resolved = path.resolve(target);
  const root = path.resolve(repoRoot);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`refusing to write outside the repository: ${resolved}`);
  }
  return resolved;
}

function checkTag() {
  const tag = flag('tag') || process.env.GITHUB_REF_NAME || '';
  const version = versionFromAdkTag(tag);
  const packages = loadPackages();
  assertGroupVersion(packages, version);
  process.stdout.write(`${packages.map((pkg) => pkg.name).join('\n')}\n`);
}

function build() {
  for (const pkg of loadPackages()) {
    const manifest = JSON.parse(fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8'));
    const scripts = manifest.scripts;
    if (!scripts || typeof scripts !== 'object' || typeof scripts.build !== 'string') {
      throw new Error(`${pkg.name} has no build script`);
    }
    process.stdout.write(`build ${pkg.name}\n`);
    runNpm(['run', 'build'], pkg.dir, 'inherit');
  }
}

function test() {
  const vitest = path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
  const result = spawnSync(
    process.execPath,
    [vitest, 'run', '--config', VITEST_CONFIG, ...KIT_UNIT_GLOBS],
    { cwd: repoRoot, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function pack() {
  const requested = flag('out');
  if (!requested) throw new Error('pack requires --out=<dir>');
  const outDir = assertInsideRepo(requested);
  fs.rmSync(outDir, { recursive: true, force: true });
  const packs = path.join(outDir, 'packs');
  fs.mkdirSync(packs, { recursive: true });
  const packages = loadPackages();
  const version = packages[0]?.version;
  if (!version) throw new Error('kit group is empty');
  assertGroupVersion(packages, version);
  /** @type {Map<string, string>} */
  const digests = new Map();
  /** @type {{ name: string, version: string, file: string }[]} */
  const indexPackages = [];
  for (const pkg of packages) {
    process.stdout.write(`pack ${pkg.name}\n`);
    const stdout = runNpm(['pack', '--json', '--pack-destination', packs], pkg.dir, 'pipe');
    const filename = path.basename(packFilename(stdout));
    const absolute = path.join(packs, filename);
    if (!fs.existsSync(absolute)) throw new Error(`npm pack did not write ${filename}`);
    digests.set(pkg.name, sha256File(absolute));
    indexPackages.push({ name: pkg.name, version: pkg.version, file: `packs/${filename}` });
  }
  const index = { version, packages: indexPackages };
  fs.writeFileSync(path.join(outDir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(
    path.join(outDir, SBOM_FILE),
    `${JSON.stringify(buildKitSbom(packages, digests), null, 2)}\n`
  );
  const publicKey = path.join(repoRoot, 'deploy/release/cosign.pub');
  if (!fs.existsSync(publicKey)) throw new Error('deploy/release/cosign.pub is missing');
  fs.copyFileSync(publicKey, path.join(outDir, PUBLIC_KEY_FILE));
  const sourceSha = flag('source-sha');
  const notes = [
    `Kassis ADK kit ${index.version}`,
    '',
    'Air-gap bundle for the changesets fixed group.',
    'packs/ holds the tarballs published with npm provenance.',
    `${SBOM_FILE} is the CycloneDX SBOM for that group.`,
    'checksums.txt lists every file here except itself and checksums.txt.sig.',
    'Each tarball has a sibling .sig from cosign (key-based, no transparency log).',
    'verify.sh checks checksums.txt.sig against cosign.pub, then runs sha256sum -c.',
    'The zip, its .sha256 file, and its .sig are attached beside this archive.',
    'Compare cosign.pub with the key distributed on a separate channel.',
    `cosign.pub sha256 ${sha256File(publicKey)}`,
    ...(sourceSha ? [`source ${sourceSha}`] : []),
    '',
    'Packages:',
    ...indexPackages.map((item) => `- ${item.name}@${item.version}`),
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'RELEASE.txt'), notes.join('\n'));
  const verify = `#!/bin/sh
set -eu
cd "$(dirname "$0")"
cosign verify-blob --key cosign.pub --insecure-ignore-tlog=true \\
  --signature checksums.txt.sig checksums.txt
sha256sum -c checksums.txt
`;
  fs.writeFileSync(path.join(outDir, 'verify.sh'), verify, { mode: 0o755 });
  process.stdout.write(`${outDir}\n`);
}

function checksums() {
  const requested = flag('dir');
  if (!requested) throw new Error('checksums requires --dir=<dir>');
  const dir = assertInsideRepo(requested);
  writeChecksums(dir);
  verifyChecksums(dir);
}

const ZIP_FALLBACK = `
import os, sys, zipfile
root, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for dirpath, _, names in os.walk(root):
        for name in sorted(names):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            info = zipfile.ZipInfo(rel)
            info.external_attr = (os.stat(full).st_mode & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(full, "rb") as fh:
                zf.writestr(info, fh.read())
`;

/** @param {string} dir @param {string} zipPath */
function zipDirectory(dir, zipPath) {
  const zipped = spawnSync('zip', ['-r', '-X', zipPath, '.'], { cwd: dir, encoding: 'utf8' });
  if (!zipped.error && zipped.status === 0) return;
  if (zipped.error && /** @type {NodeJS.ErrnoException} */ (zipped.error).code !== 'ENOENT') {
    throw zipped.error;
  }
  fs.rmSync(zipPath, { force: true });
  const py = spawnSync('python3', ['-c', ZIP_FALLBACK, dir, zipPath], { encoding: 'utf8' });
  if (py.error || py.status !== 0) {
    throw new Error(`zip failed\n${zipped.stderr ?? ''}\n${py.stderr ?? ''}`);
  }
}

function archive() {
  const requested = flag('dir');
  if (!requested) throw new Error('archive requires --dir=<dir>');
  const dir = assertInsideRepo(requested);
  const index = JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8'));
  if (!index || typeof index.version !== 'string') throw new Error('index.json has no version');
  verifyChecksums(dir);
  const zipName = airgapZipName(index.version);
  const zipPath = path.join(path.dirname(dir), zipName);
  fs.rmSync(zipPath, { force: true });
  zipDirectory(dir, zipPath);
  const hash = sha256File(zipPath);
  fs.writeFileSync(path.join(path.dirname(dir), `${zipName}.sha256`), `${hash}  ${zipName}\n`);
  process.stdout.write(`${zipPath}\n`);
}

function publish() {
  assertPublishAllowed(process.env);
  const requested = flag('dir');
  if (!requested) throw new Error('publish requires --dir=<dir>');
  const dir = assertInsideRepo(requested);
  const index = JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8'));
  if (!index || !Array.isArray(index.packages)) throw new Error('index.json has no packages');
  for (const item of index.packages) {
    if (!item || typeof item.file !== 'string' || typeof item.name !== 'string') {
      throw new Error('index.json entry is not a package');
    }
    if (item.file.includes('..') || path.isAbsolute(item.file)) {
      throw new Error(`refusing tarball path ${item.file}`);
    }
    const tarball = path.join(dir, item.file);
    if (!fs.existsSync(tarball)) throw new Error(`tarball is missing: ${item.file}`);
    process.stdout.write(`publish ${item.name}\n`);
    // npm provenance needs a public source repository on a GitHub-hosted runner.
    const provenance = process.env.ADK_KIT_PROVENANCE === '1' ? ['--provenance'] : [];
    runNpm(['publish', tarball, ...provenance, '--access', 'public'], repoRoot, 'inherit');
  }
}

const commands = { 'check-tag': checkTag, build, test, pack, checksums, archive, publish };
const command = process.argv[2];
if (!command || !(command in commands)) {
  process.stderr.write(`Usage: node tools/release/adk-kit-release.mjs <${Object.keys(commands).join('|')}>\n`);
  process.exit(1);
}

try {
  commands[command]();
} catch (error) {
  const message = error instanceof Error ? error.message : 'ADK kit release failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
