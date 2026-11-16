/**
 * Engineering-practice scanners (group E): timeouts, pagination, i18n,
 * idempotent handlers, and no module-level mutable state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { kadkIssue } from './certifyAttestation.mjs';

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const UI_EXT = /\.(tsx|jsx)$/;

function walkFiles(dir, relative, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    const next = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(absolute, next, out);
    else if (entry.isFile()) out.push({ relative: next, absolute });
  }
}

function listSourceFiles(addonDir, roots) {
  const files = [];
  for (const root of roots) {
    walkFiles(path.join(addonDir, root), root, files);
  }
  return files.filter((file) => SOURCE_EXT.test(file.relative));
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scanOutboundTimeouts(files) {
  const findings = [];
  const callPattern =
    /\b(?:fetch|got|axios\.(?:get|post|put|patch|delete|request)|http\.request|https\.request)\s*\(/g;
  for (const file of files) {
    if (file.relative.startsWith('src/ui') || file.relative.startsWith('frontend')) continue;
    const raw = fs.readFileSync(file.absolute, 'utf8');
    const text = stripComments(raw);
    let match = callPattern.exec(text);
    while (match !== null) {
      const window = text.slice(match.index, match.index + 280);
      if (!/\b(?:timeout|AbortSignal|AbortController|signal\s*:)/.test(window)) {
        findings.push({
          file: file.relative,
          line: lineOf(raw, match.index),
          snippet: match[0],
        });
      }
      match = callPattern.exec(text);
    }
    callPattern.lastIndex = 0;
  }
  return findings;
}

function scanPagination(files) {
  const findings = [];
  const findMany = /\.findMany\s*\(\s*\{([\s\S]*?)\}\s*\)/g;
  for (const file of files) {
    if (file.relative.startsWith('src/ui') || file.relative.startsWith('frontend')) continue;
    const raw = fs.readFileSync(file.absolute, 'utf8');
    const text = stripComments(raw);
    let match = findMany.exec(text);
    while (match !== null) {
      const body = match[1];
      if (!/\b(?:take|skip)\s*:/.test(body)) {
        findings.push({
          file: file.relative,
          line: lineOf(raw, match.index),
          snippet: 'findMany',
        });
      }
      match = findMany.exec(text);
    }
    findMany.lastIndex = 0;
  }
  return findings;
}

function scanUiI18n(files) {
  const findings = [];
  for (const file of files) {
    const isUi =
      file.relative.startsWith('src/ui') ||
      file.relative.startsWith('frontend') ||
      UI_EXT.test(file.relative);
    if (!isUi) continue;
    const raw = fs.readFileSync(file.absolute, 'utf8');
    const text = stripComments(raw);
    if (/\bfrom\s+['"]i18next['"]/.test(text) || /\brequire\(\s*['"]i18next['"]\s*\)/.test(text)) {
      findings.push({ file: file.relative, line: 1, snippet: 'i18next' });
    }
    if (!UI_EXT.test(file.relative)) continue;
    const jsxText = />\s*([A-Za-z][^<{]{1,80}?)\s*</g;
    let match = jsxText.exec(text);
    while (match !== null) {
      const chrome = match[1].trim();
      if (chrome.length >= 2 && !/^\{/.test(chrome) && !/^__ADDON_/.test(chrome)) {
        findings.push({
          file: file.relative,
          line: lineOf(raw, match.index),
          snippet: chrome.slice(0, 40),
        });
      }
      match = jsxText.exec(text);
    }
    jsxText.lastIndex = 0;
  }
  return findings;
}

function looksLikeHandler(file, text) {
  if (/(^|\/)(jobs|events)(\/|$)/.test(file.relative)) return true;
  return /\bctx\.(?:jobs|events)\b|\.subscribe\s*\(|registerJob|onJob\b/.test(text);
}

function scanIdempotentHandlers(files) {
  const findings = [];
  for (const file of files) {
    if (file.relative.startsWith('src/ui') || file.relative.startsWith('frontend')) continue;
    const raw = fs.readFileSync(file.absolute, 'utf8');
    const text = stripComments(raw);
    if (!looksLikeHandler(file, text)) continue;
    const mutates = /\.create\s*\(|\binsert\s*\(|\bINSERT\s+INTO\b/i.test(text);
    if (!mutates) continue;
    if (/\bidempoten|\bupsert\b|\bON\s+CONFLICT\b|\bfindFirst\b|\bfindUnique\b/i.test(text)) {
      continue;
    }
    findings.push({
      file: file.relative,
      line: 1,
      snippet: 'create/insert without idempotency marker',
    });
  }
  return findings;
}

function scanModuleState(files) {
  const findings = [];
  for (const file of files) {
    if (file.relative.startsWith('src/ui') || file.relative.startsWith('frontend')) continue;
    const raw = fs.readFileSync(file.absolute, 'utf8');
    const text = stripComments(raw);
    const lines = text.split('\n');
    let depth = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (depth === 0 && /^(export\s+)?(let|var)\s+/.test(trimmed)) {
        findings.push({
          file: file.relative,
          line: index + 1,
          snippet: trimmed.slice(0, 60),
        });
      }
      for (const char of line) {
        if (char === '{') depth += 1;
        else if (char === '}') depth = Math.max(0, depth - 1);
      }
    }
  }
  return findings;
}

function issuesFrom(code, findings, field) {
  return findings.map((item) =>
    kadkIssue(code, {
      [field]: item.file,
      line: String(item.line),
      detail: item.snippet,
    })
  );
}

/**
 * @param {string} addonDir
 * @returns {{
 *   ok: boolean,
 *   issues: import('./certifyAttestation.mjs').CatalogIssue[],
 *   evidence: object,
 *   checkResults: Record<string, { ok: boolean, findings: object[] }>
 * }}
 */
export function auditEngineeringPractice(addonDir) {
  const root = path.resolve(addonDir);
  const files = listSourceFiles(root, ['src', 'frontend']);
  const timeouts = scanOutboundTimeouts(files);
  const pagination = scanPagination(files);
  const i18n = scanUiI18n(files);
  const idempotent = scanIdempotentHandlers(files);
  const moduleState = scanModuleState(files);
  const checkResults = {
    'adk.outbound-timeouts': { ok: timeouts.length === 0, findings: timeouts },
    'adk.pagination-and-query-caps': { ok: pagination.length === 0, findings: pagination },
    'adk.ui-i18n': { ok: i18n.length === 0, findings: i18n },
    'adk.idempotent-handlers': { ok: idempotent.length === 0, findings: idempotent },
    'adk.no-module-state': { ok: moduleState.length === 0, findings: moduleState },
  };
  const issues = [
    ...issuesFrom('KADK-724', timeouts, 'path'),
    ...issuesFrom('KADK-725', pagination, 'path'),
    ...issuesFrom('KADK-726', i18n, 'path'),
    ...issuesFrom('KADK-727', idempotent, 'path'),
    ...issuesFrom('KADK-728', moduleState, 'path'),
  ];
  const evidence = {
    version: 1,
    checkResults,
    checkedAt: new Date().toISOString(),
  };
  return { ok: issues.length === 0, issues, evidence, checkResults };
}

/**
 * @param {string} addonDir
 * @param {object} evidence
 */
export function writeEngineeringPracticeEvidence(addonDir, evidence) {
  const evidenceDir = path.join(path.resolve(addonDir), '.kassis', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(
    path.join(evidenceDir, 'engineering-practice.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}
