import fs from 'node:fs';
import path from 'node:path';
import type { CommandResult, LogListener } from './types.ts';
import { commandResult, failure, redactSecrets, repoRoot } from './issues.ts';
import { runProcess } from './processRun.ts';

const SIGNER_ENV = 'KASSIS_ADDON_SIGNER';
const CHECKOUT_SIGNER = 'tools/signing/sign-all-addons.mjs';

/**
 * First-party signer used by `sign` without --key. KASSIS_ADDON_SIGNER names the
 * script; a Kassis checkout falls back to its own signer. Clients always pass --key.
 */
function hostSignerPath(): string {
  const fromEnv = process.env[SIGNER_ENV]?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(repoRoot(), CHECKOUT_SIGNER);
}

export function signWithHostSigner(id: string, onLog?: LogListener): CommandResult {
  const signer = hostSignerPath();
  if (!fs.existsSync(signer)) {
    return failure(
      'sign --key=<path> is required outside the Kassis repository',
      'Pass --key with the publisher private key file.',
      'ADK-KEY'
    );
  }
  const cwd = process.env[SIGNER_ENV] ? process.cwd() : repoRoot();
  const result = runProcess(process.execPath, [signer, `--only=${id}`], 120000, { cwd });
  if (result.stdout) onLog?.({ stream: 'stdout', text: result.stdout });
  if (result.stderr) onLog?.({ stream: 'stderr', text: result.stderr });
  if (result.timedOut) {
    return failure('sign did not finish', 'Run the repo signer again for this addon id.', 'ADK-USAGE');
  }
  if (result.status !== 0) {
    return failure(
      redactSecrets(result.stderr.trim() || 'sign failed'),
      'Fix the signer error and run sign again.'
    );
  }
  return commandResult([], { id });
}
