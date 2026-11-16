/**
 * Static scan: ctx facade calls in addon source that the manifest tier cannot use.
 * Matches @kassis/addon-sdk/tier-matrix.json and tier 2 host refusal prefixes.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { loadTierMatrix, refusedForTier } from './tierRefusal.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const BUILT_ENTRIES = ['dist/server/index.js'];

const METHOD_NAME = /^ctx\.[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,4}$/;

/**
 * @typedef {object} TierRefusalIssue
 * @property {'KADK-219'} code
 * @property {string} file
 * @property {number} line
 * @property {string} method
 * @property {string} message
 */

/**
 * @param {ts.Expression} expression
 * @returns {string | null}
 */
function ctxMethodFromExpression(expression) {
  /** @type {string[]} */
  const parts = [];
  let current = expression;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
      continue;
    }
    const arg = current.argumentExpression;
    if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) return null;
    parts.unshift(arg.text);
    current = current.expression;
  }
  if (!ts.isIdentifier(current) || current.text !== 'ctx') return null;
  if (parts.length === 0) return null;
  const method = `ctx.${parts.join('.')}`;
  return METHOD_NAME.test(method) ? method : null;
}

/**
 * @param {string} source
 * @param {string} relativeFile
 * @returns {{ method: string, line: number }[]}
 */
function ctxCallsInSource(source, relativeFile) {
  const variant =
    relativeFile.endsWith('.tsx') || relativeFile.endsWith('.jsx')
      ? ts.LanguageVariant.JSX
      : ts.LanguageVariant.Standard;
  const sourceFile = ts.createSourceFile(relativeFile, source, ts.ScriptTarget.Latest, true, variant);
  /** @type {{ method: string, line: number }[]} */
  const found = [];
  const seen = new Set();

  /**
   * @param {ts.Node} node
   */
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const method = ctxMethodFromExpression(node.expression);
      if (method) record(method, node.getStart());
    }
    ts.forEachChild(node, visit);
  }

  /**
   * @param {string} method
   * @param {number} start
   */
  function record(method, start) {
    const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
    const key = `${line}:${method}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ method, line });
  }

  visit(sourceFile);
  return found;
}

/**
 * @param {string} relativeFile
 * @returns {boolean}
 */
function isTypeScriptFile(relativeFile) {
  const extension = path.posix.extname(relativeFile);
  return (
    extension === '.ts' ||
    extension === '.tsx' ||
    extension === '.mts' ||
    extension === '.cts' ||
    extension === '.js' ||
    extension === '.jsx' ||
    extension === '.mjs' ||
    extension === '.cjs'
  );
}

/**
 * @param {string} dir
 * @param {string[]} out
 */
function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (
      entry.name.endsWith('.d.ts') ||
      entry.name.endsWith('.d.mts') ||
      entry.name.endsWith('.d.cts')
    ) {
      continue;
    }
    out.push(path.join(dir, entry.name));
  }
}

/**
 * @param {string} addonDir
 * @param {1 | 2} tier
 * @returns {TierRefusalIssue[]}
 */
export function checkAddonTierRefusals(addonDir, tier) {
  const root = path.resolve(addonDir);
  const matrix = loadTierMatrix();
  /** @type {string[]} */
  const files = [];
  walk(path.join(root, 'src'), files);
  walk(path.join(root, 'frontend'), files);
  walk(path.join(root, 'test'), files);
  for (const relative of BUILT_ENTRIES) {
    const full = path.join(root, ...relative.split('/'));
    if (fs.existsSync(full) && !files.includes(full)) files.push(full);
  }
  /** @type {TierRefusalIssue[]} */
  const issues = [];
  const seen = new Set();
  for (const file of files) {
    const relativeFile = path.relative(root, file).split(path.sep).join('/');
    if (!isTypeScriptFile(relativeFile)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const call of ctxCallsInSource(source, relativeFile)) {
      if (!refusedForTier(call.method, tier, matrix)) continue;
      const key = `${relativeFile}:${call.line}:${call.method}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        code: 'KADK-219',
        file: relativeFile,
        line: call.line,
        method: call.method,
        message: `${relativeFile} calls ${call.method}, which tier ${tier} addons cannot use`,
      });
    }
  }
  issues.sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    return left.method < right.method ? -1 : left.method > right.method ? 1 : 0;
  });
  return issues;
}