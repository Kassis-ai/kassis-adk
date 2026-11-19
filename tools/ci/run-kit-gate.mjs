/**
 * Local gate for kassis-adk. Run before every push: npm run gate
 * Stops at the first failing step and prints which one failed.
 */
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;

const STEPS = [
  ['lockfile platform packages', node, ['tools/ci/check-lockfile-platforms.mjs', 'package-lock.json']],
  ['build every package', npm, ['run', 'build']],
  ['kit boundary', node, ['tools/ci/check-addon-sdk-boundary.mjs']],
  ['guardrail catalogue', node, ['tools/ci/check-guardrail-catalog.mjs']],
  ['client docs mirror', node, ['tools/adk/sync-client-docs.mjs', '--check']],
  ['client docs paths', node, ['tools/ci/check-adk-client-docs.mjs']],
  ['CLI client docs', node, ['tools/ci/check-adk-cli-client-docs.mjs']],
  ['publish config and pack', node, ['scripts/check-package-publishing.mjs']],
  ['kit tests', npm, ['test']],
];

for (const [label, command, args] of STEPS) {
  process.stdout.write(`\n== ${label}\n`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    process.stderr.write(`\nGate failed at: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}
process.stdout.write('\nGate passed.\n');
