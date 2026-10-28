import { spawnSync } from 'node:child_process';

export interface ProcessOutput {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly missing: boolean;
  readonly timedOut: boolean;
}

export interface ProcessOptions {
  readonly input?: string;
  readonly cwd?: string;
}

function errorCode(error: Error | undefined): string {
  if (!error || !('code' in error)) return '';
  const code = error.code;
  return typeof code === 'string' ? code : '';
}

/** Runs a command and returns. `timeoutMs` of 0 waits until the process exits. */
export function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  options: ProcessOptions = {}
): ProcessOutput {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    timeout: timeoutMs > 0 ? timeoutMs : undefined,
    windowsHide: true,
    cwd: options.cwd,
    input: options.input,
  });
  const code = errorCode(result.error);
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    missing: code === 'ENOENT',
    timedOut: code === 'ETIMEDOUT',
  };
}
