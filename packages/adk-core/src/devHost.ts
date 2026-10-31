import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CommandResult, JsonObject, LogListener } from './types.ts';
import { commandResult, failure, isRecordValue, readJson } from './issues.ts';
import { runProcess } from './processRun.ts';

const PROBE_MS = 8000;
const PULL_MS = 120_000;
const DEFAULT_DEVHOST_IMAGE = 'ghcr.io/kassis-ai/kassis-devhost:latest';
const LABEL = 'com.kassis.devhost';
const STATE_NAME = 'devhost-state.json';
const CONFIG_NAME = 'devhost.json';
const ADDON_MOUNT = '/opt/kassis/dev-addon';
const IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/;

export interface DevHostState {
  readonly runtime: string;
  readonly containerId: string;
  readonly image: string;
  readonly url: string;
}

export function devHostStatePath(): string {
  return path.join(os.homedir(), '.kassis', STATE_NAME);
}

function configImage(): string {
  const file = path.join(os.homedir(), '.kassis', CONFIG_NAME);
  if (!fs.existsSync(file)) return '';
  try {
    const parsed = readJson(file);
    if (isRecordValue(parsed) && typeof parsed.image === 'string') return parsed.image.trim();
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
  }
  return '';
}

/** Flag, then KASSIS_DEVHOST_IMAGE, then ~/.kassis/devhost.json, then the published dev host image. */
export function configuredDevImage(flag: string | undefined): string {
  if (flag !== undefined) return flag.trim();
  const fromEnv = process.env.KASSIS_DEVHOST_IMAGE;
  if (fromEnv !== undefined && fromEnv.trim()) return fromEnv.trim();
  const fromFile = configImage();
  if (fromFile) return fromFile;
  return DEFAULT_DEVHOST_IMAGE;
}

function runtimeBinary(): { command: string; output: ReturnType<typeof runProcess> } | null {
  const docker = runProcess('docker', ['version', '--format', '{{.Server.Version}}'], PROBE_MS);
  if (!docker.missing && !docker.timedOut && docker.status === 0)
    return { command: 'docker', output: docker };
  if (docker.timedOut) return { command: 'docker', output: docker };
  const podman = runProcess('podman', ['version', '--format', '{{.Server.Version}}'], PROBE_MS);
  if (!podman.missing && !podman.timedOut && podman.status === 0)
    return { command: 'podman', output: podman };
  if (!docker.missing) return { command: 'docker', output: docker };
  if (!podman.missing) return { command: 'podman', output: podman };
  return null;
}

function containerPort(): string {
  const raw = process.env.KASSIS_DEVHOST_CONTAINER_PORT ?? '8080';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '8080';
  return String(port);
}

function addonId(dir: string): string {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return '';
  try {
    const parsed = readJson(file);
    if (isRecordValue(parsed) && typeof parsed.id === 'string') return parsed.id;
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
  }
  return '';
}

function writeState(state: DevHostState): void {
  const file = devHostStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function mappedUrl(runtime: string, containerId: string, port: string): string {
  const listed = runProcess(runtime, ['port', containerId, `${port}/tcp`], PROBE_MS);
  const match = /(\d+)\s*$/.exec(listed.stdout.trim());
  if (!match) return '';
  return `http://127.0.0.1:${match[1]}`;
}

function followLogs(runtime: string, containerId: string, onLog: LogListener): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(runtime, ['logs', '-f', '--tail', '50', containerId], {
      windowsHide: true,
    });
    child.stdout.on('data', (chunk: Buffer) =>
      onLog({ stream: 'stdout', text: chunk.toString('utf8') })
    );
    child.stderr.on('data', (chunk: Buffer) =>
      onLog({ stream: 'stderr', text: chunk.toString('utf8') })
    );
    child.on('error', () => resolve());
    child.on('close', () => resolve());
  });
}

/**
 * Starts a container only when an image is already configured and present locally.
 * Does not build or pull, and does not add a publisher to the host trust store.
 */
export async function startDevHost(
  dir: string,
  imageFlag: string | undefined,
  follow: boolean,
  onLog?: LogListener
): Promise<CommandResult> {
  const image = configuredDevImage(imageFlag);
  if (!image) {
    return failure(
      'No dev host image is configured. Set KASSIS_DEVHOST_IMAGE to an image that is already on this machine.',
      'This command does not build a Kassis image and does not pull from a registry.',
      'ADK-DEV-IMAGE'
    );
  }
  if (!IMAGE_PATTERN.test(image)) {
    return failure(
      'The dev host image name is not valid.',
      'Use an image reference without spaces.',
      'ADK-DEV-IMAGE'
    );
  }
  const runtime = runtimeBinary();
  if (!runtime || runtime.output.missing) {
    return failure(
      'Docker or Podman is not available.',
      'Install Docker or Podman. This command does not build or pull an image.',
      'ADK-DEV-RUNTIME'
    );
  }
  if (runtime.output.timedOut) {
    return failure(
      `${runtime.command} did not respond.`,
      'Start the container runtime and run dev again. The command stopped instead of waiting.',
      'ADK-DEV-RUNTIME'
    );
  }
  if (runtime.output.status !== 0) {
    return failure(
      `${runtime.command} is installed but did not respond.`,
      'Start the container runtime. This command does not build or pull an image.',
      'ADK-DEV-RUNTIME'
    );
  }
  const inspect = runProcess(
    runtime.command,
    ['image', 'inspect', '--format', '{{.Id}}', image],
    PROBE_MS
  );
  if (inspect.timedOut) {
    return failure(
      'Checking the local image did not finish.',
      'Run dev again when the container runtime is responding. The image was not pulled.',
      'ADK-DEV-MISSING'
    );
  }
  if (inspect.status !== 0) {
    const pulled = runProcess(runtime.command, ['pull', image], PULL_MS);
    if (pulled.timedOut || pulled.status !== 0) {
      return failure(
        `Image ${image} is not present locally and could not be pulled.`,
        'Log in to the registry that hosts the dev image, or set KASSIS_DEVHOST_IMAGE to an image already on this machine.',
        'ADK-DEV-MISSING',
        { image }
      );
    }
  }
  const id = addonId(dir);
  if (!id) {
    return failure(
      'manifest.json needs an id',
      'Run dev from an addon directory that has manifest.json.',
      'ADK-USAGE'
    );
  }
  const port = containerPort();
  const name = `kassis-devhost-${id}`;
  const started = runProcess(
    runtime.command,
    [
      'run',
      '-d',
      '--label',
      `${LABEL}=1`,
      '--name',
      name,
      '-p',
      `127.0.0.1::${port}`,
      '-v',
      `${path.resolve(dir)}:${ADDON_MOUNT}:ro`,
      image,
    ],
    PROBE_MS
  );
  if (started.timedOut || started.status !== 0) {
    const detail = started.timedOut ? 'did not finish' : started.stderr.trim() || 'failed';
    return failure(
      `The dev host container ${detail}.`,
      'If a container with this name already exists, stop it. The addon is mounted read-only and no trust-store bypass is set.',
      'ADK-DEV-RUNTIME',
      { image }
    );
  }
  const containerId = started.stdout.trim().slice(0, 12);
  const url = mappedUrl(runtime.command, containerId || name, port);
  const state: DevHostState = {
    runtime: runtime.command,
    containerId: containerId || name,
    image,
    url,
  };
  writeState(state);
  const data: JsonObject = { url, containerId: state.containerId, image, mount: ADDON_MOUNT };
  if (!url) {
    return failure(
      'The dev host container started but no host port was published.',
      `Check ${runtime.command} port ${state.containerId} ${port}/tcp. The image was not pulled.`,
      'ADK-DEV-RUNTIME',
      data
    );
  }
  onLog?.({ stream: 'stdout', text: `${url}\n` });
  if (follow && onLog) await followLogs(runtime.command, state.containerId, onLog);
  return commandResult([], data);
}

export function readDevHostState(): DevHostState | null {
  const file = devHostStatePath();
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = readJson(file);
    if (!isRecordValue(parsed)) return null;
    if (typeof parsed.runtime !== 'string' || typeof parsed.containerId !== 'string') return null;
    if (typeof parsed.image !== 'string' || typeof parsed.url !== 'string') return null;
    return {
      runtime: parsed.runtime,
      containerId: parsed.containerId,
      image: parsed.image,
      url: parsed.url,
    };
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
    return null;
  }
}
