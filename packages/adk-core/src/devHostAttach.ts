import { runProcess } from './processRun.ts';

const PROBE_MS = 8000;
const SKIP_ENV = new Set(['HOSTNAME', 'HOME']);

type AttachResult = { readonly ok: true; readonly args: readonly string[] } | { readonly ok: false; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mountArg(mount: Record<string, unknown>): string {
  const destination = mount['Destination'];
  const type = mount['Type'];
  if (typeof destination !== 'string' || typeof type !== 'string') return '';
  if (type === 'bind' && destination.startsWith('/run/secrets/')) {
    const source = mount['Source'];
    return typeof source === 'string' && source ? `${source}:${destination}:ro` : '';
  }
  if (type === 'volume' && destination === '/addons-installed') {
    const name = mount['Name'];
    return typeof name === 'string' && name ? `${name}:${destination}` : '';
  }
  return '';
}

function envArgs(env: unknown): string[] {
  if (!Array.isArray(env)) return [];
  const args: string[] = [];
  for (const item of env) {
    if (typeof item !== 'string' || !item.includes('=')) continue;
    const key = item.slice(0, item.indexOf('='));
    if (SKIP_ENV.has(key) || key === 'RUN_MODE') continue;
    args.push('--env', item);
  }
  args.push('--env', 'RUN_MODE=api');
  return args;
}

/**
 * When KASSIS_DEVHOST_ATTACH names a running stack container, the dev host
 * joins its network and receives its secrets and database settings. The
 * returned args never include the inspected environment text in a message.
 */
export function devHostAttachArgs(runtime: string): AttachResult {
  const source = process.env.KASSIS_DEVHOST_ATTACH?.trim() ?? '';
  if (!source) return { ok: true, args: [] };
  const inspected = runProcess(runtime, ['inspect', source], PROBE_MS);
  if (inspected.timedOut || inspected.status !== 0) {
    return { ok: false, message: `Dev host could not read container ${source}.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(inspected.stdout);
  } catch {
    return { ok: false, message: `Dev host could not read container ${source}.` };
  }
  const info = Array.isArray(parsed) ? parsed[0] : null;
  if (!isRecord(info)) return { ok: false, message: `Dev host could not read container ${source}.` };
  const args: string[] = [];
  const hostConfig = info['HostConfig'];
  const network = isRecord(hostConfig) ? hostConfig['NetworkMode'] : '';
  if (typeof network === 'string' && network && network !== 'default' && network !== 'host') {
    args.push('--network', network);
  }
  const config = info['Config'];
  args.push(...envArgs(isRecord(config) ? config['Env'] : []));
  const mounts = info['Mounts'];
  if (Array.isArray(mounts)) {
    for (const mount of mounts) {
      if (!isRecord(mount)) continue;
      const spec = mountArg(mount);
      if (spec) args.push('-v', spec);
    }
  }
  return { ok: true, args };
}
