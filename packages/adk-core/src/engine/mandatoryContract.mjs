/**
 * Mandatory contract (S2.21). Certify and enable refuse a record access check
 * that returns true or only throws, and a deletion handler that is empty or
 * only throws. A manifest v2 addon that declares record types or owned tables
 * must have the matching handler. v1 manifests are left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { contractHandlersInSource } from './mandatoryContractParse.mjs';

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SCAN_ROOTS = ['src/server', 'src/mcp', 'dist/server'];

function walkFiles(dir, relative, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    const next = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(absolute, next, out);
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push({ relative: next, absolute });
  }
}

function listSourceFiles(addonDir) {
  const files = [];
  for (const root of SCAN_ROOTS) {
    walkFiles(path.join(addonDir, root), root, files);
  }
  return files;
}

function readManifest(addonDir) {
  const file = path.join(addonDir, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}


function handlersInFile(file) {
  return contractHandlersInSource(file.relative, fs.readFileSync(file.absolute, 'utf8'));
}

function countOf(list, name, stub) {
  return list.filter((handler) => handler.name === name && handler.stub === stub).length;
}

/**
 * @param {string} addonDir
 */
export function auditMandatoryContract(addonDir) {
  const manifest = readManifest(addonDir);
  const evidence = {
    version: 1,
    manifestVersion: manifest && manifest.manifestVersion === 2 ? 2 : null,
    resourceTypes: Array.isArray(manifest?.resourceTypes) ? manifest.resourceTypes.length : 0,
    ownedTables: Array.isArray(manifest?.database?.ownedTables)
      ? manifest.database.ownedTables.length
      : 0,
    handlers: [],
  };
  if (!manifest || manifest.manifestVersion !== 2) {
    return { ok: true, issues: [], evidence: { ...evidence, skipped: 'not-manifest-v2' } };
  }
  const handlers = listSourceFiles(addonDir).flatMap((file) => handlersInFile(file));
  evidence.handlers = handlers.map((handler) => ({
    name: handler.name,
    file: handler.file,
    line: handler.line,
    stub: handler.stub,
  }));
  const issues = [];
  for (const handler of handlers) {
    if (!handler.stub) continue;
    issues.push(
      handler.name === 'canAccess'
        ? contractIssue(
            'KADK-730',
            `Access check '${handler.name}' in '${handler.file}' returns true or only throws`,
            `Replace the access check in '${handler.file}' so it decides from the principal and the record. A return true body and a body that only throws are stubs.`
          )
        : contractIssue(
            'KADK-732',
            `Deletion handler '${handler.name}' in '${handler.file}' is empty or only throws`,
            `Replace the deletion handler in '${handler.file}' so it erases or detaches the record. An empty body and a body that only throws are stubs.`
          )
    );
  }
  const realAccess = countOf(handlers, 'canAccess', false);
  const stubAccess = countOf(handlers, 'canAccess', true);
  if (evidence.resourceTypes > 0 && realAccess + stubAccess < evidence.resourceTypes) {
    issues.push(
      contractIssue(
        'KADK-729',
        "Record access check is missing for a declared record type ('manifest.json')",
        'Add a canAccess handler for each resourceTypes entry. A missing handler is not an allow.'
      )
    );
  }
  const realDelete = countOf(handlers, 'onDelete', false);
  const stubDelete = countOf(handlers, 'onDelete', true);
  if (evidence.ownedTables > 0 && realDelete + stubDelete < 1) {
    issues.push(
      contractIssue(
        'KADK-731',
        "Deletion handler is missing while the addon owns tables ('manifest.json')",
        'Add an onDelete handler when database.ownedTables is not empty.'
      )
    );
  }
  return { ok: issues.length === 0, issues, evidence };
}

function contractIssue(code, message, fix) {
  return { code, severity: 'error', message, fix };
}

export function mandatoryContractRefusal(audit) {
  if (audit.ok) return null;
  const first = audit.issues[0];
  const message = first ? `${first.code}: ${first.message}` : 'Mandatory contract is not intact';
  return { code: 'MANDATORY_CONTRACT', message };
}

export function writeMandatoryContractEvidence(addonDir, evidence) {
  const dir = path.join(addonDir, '.kassis', 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'mandatory-contract.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  );
}
