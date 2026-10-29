/**
 * package, deploy, and status. This module returns a result.
 * It does not print and it does not exit.
 * package reads the local addon folder only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { writeAddonSbom } from '../../../tools/adk/addonSbom.mjs';
import {
  computeAddonContentHash,
  isContentHash,
  listAddonContentFiles,
} from '../../../server/core/addon-deployment/addonContentHash.mjs';
import type { CommandResult, JsonObject, JsonValue } from './types.ts';
import { commandResult, failure, isRecordValue, readJson } from './issues.ts';

const ZIP_TIME = 0;
const ZIP_DATE = ((2026 - 1980) << 9) | (10 << 5) | 28;
const REQUEST_MS = 30_000;

type ZipEntry = {
  name: string;
  data: Buffer;
};

type InstallationView = {
  id: string;
  activeVersion: string | null;
  publisher: string | null;
  pendingVersions: string[];
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'command failed';
}

function packageFileName(id: string, version: string): string {
  const segment = /^[a-zA-Z0-9][a-zA-Z0-9.+_-]*$/;
  if (!segment.test(id) || !segment.test(version) || id.includes('..') || version.includes('..')) return '';
  return `${id}-${version}.addon`;
}

function outputFile(dir: string, fileName: string, out: string, cwd: string): string {
  if (!out) return path.join(path.dirname(dir), fileName);
  const resolved = path.resolve(cwd, out);
  if (resolved.endsWith('.addon')) return resolved;
  return path.join(resolved, fileName);
}

function ensureSbom(dir: string): void {
  const file = path.join(dir, 'sbom.json');
  const build = path.join(dir, 'dist', 'server', 'index.js');
  const missing = !fs.existsSync(file);
  const stale =
    !missing &&
    fs.existsSync(build) &&
    fs.statSync(file).mtimeMs < fs.statSync(build).mtimeMs;
  if (missing || stale) writeAddonSbom(dir);
}

export function sbomProject(dir: string): CommandResult {
  try {
    writeAddonSbom(dir);
    return commandResult([], { path: path.join(dir, 'sbom.json') });
  } catch (error) {
    return failure(messageOf(error), 'Run sbom in an addon folder that has a package.json.', 'ADK-PACKAGE');
  }
}

function evidenceReady(dir: string, contentHash: string): CommandResult | null {
  const checks = path.join(dir, '.kassis', 'evidence', 'checks.json');
  const attestation = path.join(dir, '.kassis', 'attestation.json');
  const lock = path.join(dir, '.kassis', 'agent-profile.lock.json');
  if (!fs.existsSync(checks)) {
    return failure(
      'certify evidence is missing',
      'Run kassis-addon certify, then package.',
      'ADK-PACKAGE'
    );
  }
  if (!fs.existsSync(attestation) || !fs.existsSync(lock)) {
    return failure(
      'certify attestation or lock is missing',
      'Run kassis-addon certify, then package.',
      'ADK-PACKAGE'
    );
  }
  const parsed = readJson(checks);
  if (!isRecordValue(parsed) || parsed.contentHash !== contentHash) {
    return failure(
      'certify evidence does not match contentHash',
      'Run kassis-addon certify after sign, then package.',
      'ADK-PACKAGE'
    );
  }
  const rows = parsed.checks;
  if (!Array.isArray(rows) || rows.length === 0) {
    return failure(
      'certify evidence has no checks',
      'Run kassis-addon certify, then package.',
      'ADK-PACKAGE'
    );
  }
  if (!rows.every((row) => isRecordValue(row) && row.exitCode === 0)) {
    return failure(
      'certify checks did not all pass',
      'Fix the failing checks, run kassis-addon certify, then package.',
      'ADK-PACKAGE'
    );
  }
  return null;
}

function byName(left: ZipEntry, right: ZipEntry): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

function zipPath(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => part === '' || part === '..' || part === '.')) {
    throw new Error(`Refusing zip entry ${name}`);
  }
  return normalized;
}

async function uiBundleEntries(dir: string): Promise<ZipEntry[]> {
  const uiDir = path.join(dir, 'frontend', 'dist');
  if (!fs.existsSync(uiDir)) return [];
  const stat = await fsp.lstat(uiDir);
  if (!stat.isDirectory()) throw new Error('frontend/dist must be a directory');
  const entries: ZipEntry[] = [];
  await walkEvidence(uiDir, 'frontend/dist', entries);
  return entries;
}

async function evidenceEntries(dir: string): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  const certified = path.join(dir, '.kassis', 'evidence');
  if (fs.existsSync(certified)) {
    await walkEvidence(certified, 'evidence', entries);
  }
  for (const name of ['attestation.json', 'agent-profile.lock.json']) {
    const file = path.join(dir, '.kassis', name);
    const zipName = `evidence/${name}`;
    if (!fs.existsSync(file) || entries.some((entry) => entry.name === zipName)) continue;
    entries.push({ name: zipPath(zipName), data: await fsp.readFile(file) });
  }
  const evidenceDir = path.join(dir, 'evidence');
  if (!fs.existsSync(evidenceDir)) return entries;
  const stat = await fsp.lstat(evidenceDir);
  if (!stat.isDirectory()) {
    throw new Error('evidence must be a directory');
  }
  await walkEvidence(evidenceDir, 'evidence', entries);
  return entries;
}

async function walkEvidence(directory: string, prefix: string, entries: ZipEntry[]): Promise<void> {
  const children = await fsp.readdir(directory, { withFileTypes: true });
  for (const child of children) {
    const absolute = path.join(directory, child.name);
    const name = `${prefix}/${child.name}`;
    const linked = await fsp.lstat(absolute);
    if (linked.isSymbolicLink()) throw new Error(`${name} is a symbolic link`);
    if (linked.isDirectory()) {
      await walkEvidence(absolute, name, entries);
      continue;
    }
    if (!linked.isFile()) throw new Error(`${name} is not a regular file`);
    entries.push({ name: zipPath(name), data: await fsp.readFile(absolute) });
  }
}

async function zipEntries(dir: string): Promise<ZipEntry[]> {
  const files = await listAddonContentFiles(dir);
  const entries: ZipEntry[] = [
    { name: 'manifest.json', data: await fsp.readFile(path.join(dir, 'manifest.json')) },
  ];
  for (const file of files) {
    entries.push({ name: zipPath(file.relativePath), data: await fsp.readFile(file.absolutePath) });
  }
  if (!entries.some((entry) => entry.name === 'sbom.json')) {
    entries.push({ name: 'sbom.json', data: await fsp.readFile(path.join(dir, 'sbom.json')) });
  }
  entries.push(...(await evidenceEntries(dir)));
  entries.push(...(await uiBundleEntries(dir)));
  entries.sort(byName);
  return entries;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storeZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(ZIP_TIME, 10);
    local.writeUInt16LE(ZIP_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(ZIP_TIME, 12);
    central.writeUInt16LE(ZIP_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDirectory, end]);
}

/** Writes `<id>-<version>.addon` beside the addon folder unless --out is set. */
export async function packageProject(dir: string, out: string, cwd: string): Promise<CommandResult> {
  try {
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return failure('manifest.json was not found', 'Run package in an addon folder.', 'ADK-PACKAGE');
    }
    const parsed = readJson(manifestPath);
    if (!isRecordValue(parsed)) {
      return failure('manifest.json is not an object', 'Fix manifest.json and sign it.', 'ADK-PACKAGE');
    }
    if (typeof parsed.signature !== 'string' || parsed.signature.trim() === '') {
      return failure(
        'manifest.json has no signature',
        'Run kassis-addon sign, then package. package does not sign.',
        'ADK-PACKAGE'
      );
    }
    const signedHash = parsed.contentHash;
    if (!isContentHash(signedHash)) {
      return failure(
        'manifest.json has no contentHash',
        'Run kassis-addon sign, then package. package does not sign.',
        'ADK-PACKAGE'
      );
    }
    const id = typeof parsed.id === 'string' ? parsed.id : '';
    const version = typeof parsed.version === 'string' ? parsed.version : '';
    const fileName = packageFileName(id, version);
    if (!fileName) {
      return failure(
        'manifest.json id or version cannot be used as a file name',
        'Use an addon id and a dotted version without slashes.',
        'ADK-PACKAGE'
      );
    }
    ensureSbom(dir);
    const evidence = evidenceReady(dir, signedHash);
    if (evidence) return evidence;
    const actualHash = await computeAddonContentHash(dir);
    if (actualHash !== signedHash) {
      return failure(
        'contentHash does not match the addon files',
        'Run kassis-addon sign after the files change, then package.',
        'ADK-PACKAGE'
      );
    }
    const archive = storeZip(await zipEntries(dir));
    const destination = outputFile(dir, fileName, out, cwd);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, archive);
    return commandResult([], {
      path: destination,
      sha256: crypto.createHash('sha256').update(archive).digest('hex'),
    });
  } catch (error) {
    return failure(messageOf(error), 'Fix the addon folder and run package again.', 'ADK-PACKAGE');
  }
}

function adkToken(code: string): CommandResult | string {
  const token = process.env.KASSIS_ADK_TOKEN ?? '';
  if (!token.trim()) {
    return failure(
      'KASSIS_ADK_TOKEN is required',
      'Set KASSIS_ADK_TOKEN. The token is sent as a bearer token and is not printed.',
      code
    );
  }
  return token;
}

function instanceTarget(instance: string, pathname: string, code: string): URL | CommandResult {
  const command = code === 'ADK-DEPLOY' ? 'deploy' : 'status';
  if (!instance.trim()) {
    return failure(
      `${command} --instance=<url> is required`,
      'Pass --instance <url> or --instance=<url>.',
      code
    );
  }
  let target: URL;
  try {
    target = new URL(pathname, instance);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return failure('--instance is not a URL', 'Pass an http or https URL.', code);
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return failure('--instance must be http or https', 'Pass an http or https URL.', code);
  }
  target.username = '';
  target.password = '';
  return target;
}

function isResult(value: CommandResult | string | URL): value is CommandResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function errorText(status: number, text: string, label: string): string {
  const body = parseBody(text);
  if (isRecordValue(body) && typeof body.error === 'string' && body.error.length > 0 && body.error.length < 300) {
    return `${label} failed (${status}): ${body.error}`;
  }
  return `${label} failed (${status})`;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function responseData(body: unknown): Record<string, unknown> | null {
  if (!isRecordValue(body)) return null;
  if (isRecordValue(body.data)) return body.data;
  return body;
}

function soleAddon(directory: string): string {
  if (!fs.existsSync(directory)) return '';
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.addon') && !name.startsWith('.'));
  if (names.length !== 1) return '';
  return path.join(directory, names[0] ?? '');
}

function namedAddon(dir: string): string {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return '';
  const parsed = readJson(manifestPath);
  if (!isRecordValue(parsed)) return '';
  const id = typeof parsed.id === 'string' ? parsed.id : '';
  const version = typeof parsed.version === 'string' ? parsed.version : '';
  const fileName = packageFileName(id, version);
  if (!fileName) return '';
  const beside = path.join(path.dirname(dir), fileName);
  if (fs.existsSync(beside)) return beside;
  const inside = path.join(dir, fileName);
  if (fs.existsSync(inside)) return inside;
  return '';
}

function addonPackagePath(dir: string, cwd: string, positional: string): CommandResult | string {
  if (positional) {
    const resolved = path.resolve(cwd, positional);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return failure(`Addon package was not found: ${positional}`, 'Pass the path to the .addon file.', 'ADK-DEPLOY');
    }
    return resolved;
  }
  const named = namedAddon(dir);
  if (named) return named;
  const only = soleAddon(cwd) || (dir !== cwd ? soleAddon(dir) : '');
  if (only) return only;
  return failure(
    'No .addon file was found',
    'Run package first, or pass the .addon path. deploy uploads that file and does not rebuild it.',
    'ADK-DEPLOY'
  );
}

async function postPackage(url: URL, token: string, filePath: string): Promise<CommandResult> {
  const bytes = await fsp.readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const form = new FormData();
  form.append('addonPackage', new Blob([new Uint8Array(bytes)]), path.basename(filePath));
  form.append('archiveSha256', sha256);
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_MS),
  });
  const text = await response.text();
  if (response.status !== 202) {
    return failure(errorText(response.status, text, 'Deploy'), 'Check the token, the instance URL, and system.admin.', 'ADK-DEPLOY');
  }
  const data = responseData(parseBody(text));
  const requestId = data ? stringField(data, 'requestId') : '';
  if (!requestId) {
    return failure('Deploy did not return a request id', 'The instance should return 202 with requestId.', 'ADK-DEPLOY');
  }
  return commandResult([], {
    requestId,
    deploymentId: data ? stringField(data, 'deploymentId') : '',
    addonId: data ? stringField(data, 'addonId') : '',
    version: data ? stringField(data, 'version') : '',
    state: data ? stringField(data, 'state') : '',
    path: filePath,
    sha256,
  });
}

/** Uploads an .addon. The token is KASSIS_ADK_TOKEN. */
export async function deployProject(
  dir: string,
  instance: string,
  positional: string,
  cwd: string
): Promise<CommandResult> {
  try {
    const target = instanceTarget(instance, '/api/v1/addon-security/deploy', 'ADK-DEPLOY');
    if (isResult(target)) return target;
    const token = adkToken('ADK-DEPLOY');
    if (isResult(token)) return token;
    const filePath = addonPackagePath(dir, cwd, positional);
    if (isResult(filePath)) return filePath;
    return await postPackage(target, token, filePath);
  } catch (error) {
    return failure(messageOf(error), 'Check the instance URL and the .addon file.', 'ADK-DEPLOY');
  }
}

function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function installationsFrom(body: unknown): InstallationView[] | null {
  const data = responseData(body);
  if (!data || !Array.isArray(data.installations)) return null;
  const rows: InstallationView[] = [];
  for (const item of data.installations) {
    if (!isRecordValue(item)) continue;
    const id = plainText(item.id);
    if (!id) continue;
    const pending: string[] = [];
    if (Array.isArray(item.pendingVersions)) {
      for (const version of item.pendingVersions) {
        const text = plainText(version);
        if (text) pending.push(text);
      }
    }
    rows.push({
      id,
      activeVersion: plainText(item.activeVersion),
      publisher: plainText(item.publisher),
      pendingVersions: pending,
    });
  }
  return rows;
}

function installationsJson(rows: readonly InstallationView[]): JsonValue[] {
  return rows.map((row) => ({
    id: row.id,
    activeVersion: row.activeVersion,
    publisher: row.publisher,
    pendingVersions: [...row.pendingVersions],
  }));
}

/** Reads installed and pending versions. The token is KASSIS_ADK_TOKEN. */
export async function statusProject(instance: string): Promise<CommandResult> {
  try {
    const target = instanceTarget(instance, '/api/v1/platform/addons/installations', 'ADK-STATUS');
    if (isResult(target)) return target;
    const token = adkToken('ADK-STATUS');
    if (isResult(token)) return token;
    const response = await fetch(target, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_MS),
    });
    const text = await response.text();
    if (response.status !== 200) {
      return failure(errorText(response.status, text, 'Status'), 'Check the token, the instance URL, and system.admin.', 'ADK-STATUS');
    }
    const rows = installationsFrom(parseBody(text));
    if (!rows) {
      return failure(
        'Status did not return installations',
        'The instance should return id, active version, publisher, and pending versions.',
        'ADK-STATUS'
      );
    }
    const data: JsonObject = { installations: installationsJson(rows) };
    return commandResult([], data);
  } catch (error) {
    return failure(messageOf(error), 'Check the instance URL.', 'ADK-STATUS');
  }
}
