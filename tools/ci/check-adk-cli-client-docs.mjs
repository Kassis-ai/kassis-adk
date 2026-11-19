/**
 * Client ADK pages must ship inside @kassis/addon-cli (lib/client-docs after prepack).
 * Verifies the adk-core mirror matches source docs and that npm pack lists them.
 *
 * Usage: node tools/ci/check-adk-cli-client-docs.mjs
 *        npm run ci:adk:cli-client-docs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const syncScript = path.join(repoRoot, 'tools/adk/sync-client-docs.mjs');
const cliRoot = path.join(repoRoot, 'packages/addon-cli');
const indexPath = path.join(repoRoot, 'packages/adk-core/src/discovery/docs-index.json');

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', FORCE_COLOR: '0' },
  });
  return result;
}

function ensureAddonSdkDist() {
  const distEntry = path.join(repoRoot, 'packages/addon-sdk/dist/index.js');
  if (fs.existsSync(distEntry)) return;
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: path.join(repoRoot, 'packages/addon-sdk'),
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, CI: 'true' },
  });
  if (build.status !== 0) {
    throw new Error(`@kassis/addon-sdk build failed\n${build.stdout ?? ''}\n${build.stderr ?? ''}`);
  }
}

function packFileList() {
  ensureAddonSdkDist();
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: cliRoot,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, CI: 'true' },
  });
  if (result.status !== 0) {
    throw new Error(`npm pack --dry-run failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  }
  const start = (result.stdout ?? '').indexOf('[');
  if (start < 0) throw new Error('npm pack did not return JSON');
  const packed = JSON.parse(result.stdout.slice(start));
  const files = packed?.[0]?.files;
  if (!Array.isArray(files)) throw new Error('npm pack JSON missing files[]');
  return files.map((row) => (typeof row?.path === 'string' ? row.path.replace(/\\/g, '/') : '')).filter(Boolean);
}

function main() {
  const failures = [];

  const mirrorCheck = runNode(syncScript, ['--check']);
  if (mirrorCheck.status !== 0) {
    failures.push('client-docs mirror drift (run node tools/adk/sync-client-docs.mjs)');
    const tail = `${mirrorCheck.stdout ?? ''}\n${mirrorCheck.stderr ?? ''}`.trim();
    for (const line of tail.split('\n').slice(-12)) {
      if (line.trim()) failures.push(`  ${line.trim()}`);
    }
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const ids = (Array.isArray(index.documents) ? index.documents : [])
    .map((d) => (d && typeof d.id === 'string' ? d.id : null))
    .filter(Boolean);

  let packedFiles = [];
  try {
    packedFiles = packFileList();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  for (const id of ids) {
    const rel = `package/lib/client-docs/${id}.md`;
    if (packedFiles.length > 0 && !packedFiles.some((p) => p === rel || p.endsWith(`/client-docs/${id}.md`))) {
      failures.push(`npm pack --dry-run missing ${rel}`);
    }
  }
  const maintainersPacked = packedFiles.some((p) => p.includes('maintainers.md'));
  if (maintainersPacked) {
    failures.push('npm pack must not ship maintainers.md');
  }

  if (failures.length > 0) {
    console.error('ci:adk:cli-client-docs failed\n');
    for (const row of failures) console.error(`  ${row}`);
    process.exit(1);
  }

  console.log(`ci:adk:cli-client-docs OK (${ids.length} pages in pack tarball)`);
}

main();