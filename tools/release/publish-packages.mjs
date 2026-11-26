/**
 * Publish every package in the changesets fixed group to npmjs.com, in dependency order.
 *
 *   node tools/release/publish-packages.mjs [--dry-run] [--only=@kassis/a,@kassis/b] [--tag=latest] [--otp=123456]
 *
 * Uses NPM_TOKEN (granular, read/write on @kassis, bypass 2FA) via a temporary --userconfig file.
 * Never prints the token. Does not push git tags.
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpm } from '../adk/airgap-bundle.mjs';
import {
  formatSummaryTable,
  githubActionsProvenance,
  parsePublishArgs,
  resolveAuth,
  selectPackages,
  writeTempNpmUserconfig,
} from './publishPackagesLib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string | null} userconfig @param {Record<string, string | undefined>} extra */
function npmEnv(userconfig, extra) {
  if (userconfig) return { ...process.env, ...extra, NPM_CONFIG_USERCONFIG: userconfig };
  return { ...process.env, ...extra };
}

/** @param {string[]} args @param {string} cwd @param {string | null} userconfig @param {Record<string, string | undefined>} extra */
function npm(args, cwd, userconfig, extra = {}) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: npmEnv(userconfig, extra),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`npm ${args.join(' ')} failed (${result.status ?? 'signal'})${detail ? `\n${detail}` : ''}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

/**
 * @param {string} name
 * @param {string} version
 * @param {string | null} userconfig
 */
function versionOnRegistry(name, version, userconfig) {
  try {
    const out = npm(['view', `${name}@${version}`, 'version'], repoRoot, userconfig).trim();
    const seen = out.split('\n').pop()?.trim() ?? '';
    return seen === version;
  } catch {
    return false;
  }
}

/** @param {string} name @param {string} version @param {string | null} userconfig */
function assertPublished(name, version, userconfig) {
  if (!versionOnRegistry(name, version, userconfig)) {
    throw new Error(`npm registry does not show ${name}@${version} after publish`);
  }
}

function runRootScript(scriptName) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const scripts = manifest.scripts;
  if (!scripts || typeof scripts !== 'object' || typeof scripts[scriptName] !== 'string') return;
  process.stdout.write(`\n== preflight: npm run ${scriptName}\n`);
  runNpm(['run', scriptName], repoRoot, 'inherit');
}

function runPreflight() {
  for (const step of ['build', 'test', 'gate']) runRootScript(step);
}

/**
 * @param {string} dir
 * @param {boolean} dryRun
 * @param {string | null} userconfig
 */
function packCheck(dir, dryRun, userconfig) {
  const args = dryRun ? ['pack', '--dry-run'] : ['pack', '--json'];
  npm(args, dir, userconfig);
}

/**
 * @param {{ name: string, dir: string, version: string }} pkg
 * @param {import('./publishPackagesLib.mjs').PublishOptions} options
 * @param {string | null} userconfig
 * @param {boolean} useProvenance
 */
function publishOne(pkg, options, userconfig, useProvenance) {
  /** @type {string[]} */
  const args = ['publish', '--access', 'public', `--tag=${options.tag}`];
  if (options.dryRun) args.push('--dry-run');
  if (useProvenance && !options.dryRun) args.push('--provenance');
  if (options.otp) args.push(`--otp=${options.otp}`);
  if (userconfig) args.push(`--userconfig=${userconfig}`);
  npm(args, pkg.dir, userconfig);
}

function main() {
  const options = parsePublishArgs(process.argv.slice(2));
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(
      'Usage: node tools/release/publish-packages.mjs [--dry-run] [--only=pkg,...] [--tag=latest] [--otp=123456]\n'
    );
    return;
  }

  /** @type {string | null} */
  let userconfig = null;
  try {
    const auth = resolveAuth(options.dryRun, options.otp);
    if (auth.usedOtp) {
      process.stderr.write(
        'Using --otp for every package in this run. npm OTPs expire in about 30 seconds; refresh the code if publish fails.\n'
      );
    }
    if (auth.token) {
      userconfig = path.join(os.tmpdir(), `kassis-adk-npm-${randomUUID()}.ini`);
      writeTempNpmUserconfig(auth.token, userconfig);
    }

    if (!options.skipPreflight) runPreflight();

    const packages = selectPackages(repoRoot, options.only);
    process.stdout.write(`\nPublish order:\n${packages.map((pkg) => `  ${pkg.name}@${pkg.version}`).join('\n')}\n`);

    const useProvenance = githubActionsProvenance();
    /** @type {Array<{ name: string, status: string, detail?: string }>} */
    const summary = [];
    let failures = 0;

    for (const pkg of packages) {
      const label = `${pkg.name}@${pkg.version}`;
      try {
        if (versionOnRegistry(pkg.name, pkg.version, userconfig)) {
          process.stdout.write(`skip ${label} (already on npm)\n`);
          summary.push({ name: pkg.name, status: 'skipped', detail: pkg.version });
          continue;
        }
        packCheck(pkg.dir, options.dryRun, userconfig);
        process.stdout.write(`${options.dryRun ? 'dry-run publish' : 'publish'} ${label}\n`);
        publishOne(pkg, options, userconfig, useProvenance);
        if (options.dryRun) {
          summary.push({ name: pkg.name, status: 'dry-run', detail: pkg.version });
        } else {
          assertPublished(pkg.name, pkg.version, userconfig);
          summary.push({ name: pkg.name, status: 'published', detail: pkg.version });
        }
      } catch (error) {
        failures += 1;
        const message = error instanceof Error ? error.message : 'publish failed';
        summary.push({ name: pkg.name, status: 'failed', detail: message.split('\n')[0] });
        process.stderr.write(`${message}\n`);
      }
    }

    process.stdout.write(`\n${formatSummaryTable(summary)}`);
    if (failures > 0) process.exit(1);
  } finally {
    if (userconfig && fs.existsSync(userconfig)) {
      try {
        fs.rmSync(userconfig, { force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'publish-packages failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}