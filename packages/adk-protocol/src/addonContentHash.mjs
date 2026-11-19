/**
 * Addon content hash: a sha256 tree hash over the addon files in scope,
 * stored as manifest.contentHash and covered by the manifest signature.
 *
 * Plain ESM with no package imports so the server (run by tsx) and the
 * plain-node signing tools compute the same value. The file scope is in
 * addonContentHash.config.json next to this module.
 *
 *   files  = regular files under the addon folder whose POSIX relative path
 *            matches an include glob and no exclude glob
 *   digest = sha256 of the file bytes, reading every CRLF pair as LF, unless
 *            the file contains a NUL byte (then the raw bytes are hashed)
 *   tree   = for each file in path order (UTF-16 code units):
 *            utf8(path) 0x00 hex(digest) 0x0A
 *   value  = "sha256-" + hex(sha256(tree))
 *
 * CRLF is read as LF because Windows working copies can hold CRLF while git,
 * CI and Docker builds of the same commit hold LF (.gitattributes eol=lf).
 * Symbolic links and special files inside the scope are rejected so the hash
 * never depends on content outside the addon folder.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const CONTENT_HASH_PREFIX = 'sha256-';
const CONTENT_HASH_PATTERN = /^sha256-[0-9a-f]{64}$/;
const SCOPE_CONFIG_URL = new URL('./addonContentHash.config.json', import.meta.url);
const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN_BYTE = Buffer.from([CARRIAGE_RETURN]);

let scopePromise = null;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isContentHash(value) {
  return typeof value === 'string' && CONTENT_HASH_PATTERN.test(value);
}

/**
 * @param {string} addonDir
 * @returns {Promise<string>}
 */
export async function computeAddonContentHash(addonDir) {
  return hashAddonContentFiles(await listAddonContentFiles(addonDir));
}

/**
 * Hash of frontend/dist only. Null when that folder is missing or empty.
 * Client packages sign this separately from contentHash.
 *
 * @param {string} addonDir
 * @returns {Promise<string | null>}
 */
export async function computeUiContentHash(addonDir) {
  const files = await listUiContentFiles(addonDir);
  if (files.length === 0) return null;
  return hashAddonContentFiles(files);
}

/**
 * frontend/dist files, with the stat fields a caller needs to notice changes
 * without rehashing. Empty when that folder is missing.
 *
 * @param {string} addonDir
 * @returns {Promise<Array<{ relativePath: string, absolutePath: string, size: number, mtimeMs: number, ctimeMs: number }>>}
 */
export async function listUiContentFiles(addonDir) {
  const root = await fsp.realpath(addonDir);
  const uiRoot = path.join(root, 'frontend', 'dist');
  if (!fs.existsSync(uiRoot)) return [];
  const files = [];
  await collectUiFiles(uiRoot, 'frontend/dist', files);
  return files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
}

async function collectUiFiles(directory, relativeDir, files) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDir}/${entry.name}`;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectUiFiles(absolutePath, relativePath, files);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Addon UI "${relativePath}" is not a regular file; symbolic links and special files are not allowed`
      );
    }
    const stats = await fsp.lstat(absolutePath);
    files.push({
      relativePath,
      absolutePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
    });
  }
}

/**
 * In-scope files of an addon folder, sorted by relative path, with the stat
 * fields a caller needs to notice changes without rehashing.
 *
 * @param {string} addonDir
 * @returns {Promise<Array<{ relativePath: string, absolutePath: string, size: number, mtimeMs: number, ctimeMs: number }>>}
 */
export async function listAddonContentFiles(addonDir) {
  const scope = await loadContentHashScope();
  const root = await fsp.realpath(addonDir);
  const files = [];
  await collectFiles(root, '', scope, files);
  return files.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
}

/**
 * @param {ReadonlyArray<{ relativePath: string, absolutePath: string }>} files
 * @returns {Promise<string>}
 */
export async function hashAddonContentFiles(files) {
  const ordered = [...files].sort((left, right) =>
    compareCodeUnits(left.relativePath, right.relativePath)
  );
  const tree = crypto.createHash('sha256');
  for (const file of ordered) {
    const digest = await hashFileContent(file.absolutePath);
    tree.update(`${file.relativePath}\0${digest}\n`, 'utf8');
  }
  return `${CONTENT_HASH_PREFIX}${tree.digest('hex')}`;
}

function loadContentHashScope() {
  scopePromise ??= readScopeConfig().catch((error) => {
    scopePromise = null;
    throw error;
  });
  return scopePromise;
}

async function readScopeConfig() {
  const config = JSON.parse(await fsp.readFile(SCOPE_CONFIG_URL, 'utf8'));
  const include = readGlobList(config, 'include');
  const exclude = readGlobList(config, 'exclude');
  if (include.length === 0) {
    throw new TypeError('addonContentHash.config.json: "include" must list at least one glob');
  }
  return {
    include: include.map(globToRegExp),
    exclude: exclude.map(globToRegExp),
    excludedDirectories: exclude
      .filter((pattern) => pattern.endsWith('/**'))
      .map((pattern) => globToRegExp(pattern.slice(0, -'/**'.length))),
  };
}

function readGlobList(config, field) {
  const patterns = config?.[field];
  if (
    !Array.isArray(patterns) ||
    !patterns.every((pattern) => typeof pattern === 'string' && pattern.length > 0)
  ) {
    throw new TypeError(
      `addonContentHash.config.json: "${field}" must be an array of non-empty glob strings`
    );
  }
  return patterns;
}

function globToRegExp(pattern) {
  if (/[[\]{}!\\]/.test(pattern) || /^\/|\/$|\/\//.test(pattern)) {
    throw new TypeError(`addonContentHash.config.json: unsupported glob "${pattern}"`);
  }
  const segments = pattern.split('/');
  const source = segments
    .map((segment, index) => {
      const isLast = index === segments.length - 1;
      if (segment === '**') return isLast ? '.*' : '(?:[^/]+/)*';
      if (segment.includes('**')) {
        throw new TypeError(
          `addonContentHash.config.json: "**" must be a whole path segment in "${pattern}"`
        );
      }
      const segmentSource = segment.replace(/[.+^$()|*?]/g, (char) => {
        if (char === '*') return '[^/]*';
        if (char === '?') return '[^/]';
        return `\\${char}`;
      });
      return isLast ? segmentSource : `${segmentSource}/`;
    })
    .join('');
  return new RegExp(`^${source}$`);
}

function matchesAny(regexps, relativePath) {
  return regexps.some((regexp) => regexp.test(relativePath));
}

function isInScope(relativePath, scope) {
  return matchesAny(scope.include, relativePath) && !matchesAny(scope.exclude, relativePath);
}

async function collectFiles(root, relativeDir, scope, files) {
  const entries = await fsp.readdir(relativeDir ? path.join(root, relativeDir) : root, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (matchesAny(scope.excludedDirectories, relativePath)) continue;
    if (entry.isDirectory()) {
      await collectFiles(root, relativePath, scope, files);
      continue;
    }
    if (!isInScope(relativePath, scope)) continue;
    if (!entry.isFile()) {
      throw new Error(
        `Addon content "${relativePath}" is not a regular file; symbolic links and special files are not allowed in signed addon content`
      );
    }
    const absolutePath = path.join(root, relativePath);
    const stats = await fsp.lstat(absolutePath);
    files.push({
      relativePath,
      absolutePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
    });
  }
}

async function hashFileContent(absolutePath) {
  const rawDigest = crypto.createHash('sha256');
  const textDigest = crypto.createHash('sha256');
  let isBinary = false;
  let pendingCarriageReturn = false;
  for await (const chunk of fs.createReadStream(absolutePath)) {
    rawDigest.update(chunk);
    if (isBinary) continue;
    if (chunk.includes(0)) {
      isBinary = true;
      continue;
    }
    pendingCarriageReturn = updateWithLineFeeds(textDigest, chunk, pendingCarriageReturn);
  }
  if (isBinary) return rawDigest.digest('hex');
  if (pendingCarriageReturn) textDigest.update(CARRIAGE_RETURN_BYTE);
  return textDigest.digest('hex');
}

function updateWithLineFeeds(digest, chunk, pendingCarriageReturn) {
  if (pendingCarriageReturn && chunk[0] !== LINE_FEED) {
    digest.update(CARRIAGE_RETURN_BYTE);
  }
  let start = 0;
  for (
    let index = chunk.indexOf(CARRIAGE_RETURN);
    index !== -1;
    index = chunk.indexOf(CARRIAGE_RETURN, index + 1)
  ) {
    if (index === chunk.length - 1) {
      digest.update(chunk.subarray(start, index));
      return true;
    }
    if (chunk[index + 1] === LINE_FEED) {
      digest.update(chunk.subarray(start, index));
      start = index + 1;
    }
  }
  digest.update(chunk.subarray(start));
  return false;
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}
