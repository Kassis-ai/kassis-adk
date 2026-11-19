/**
 * Fail CI when a kit package imports anything outside itself: the host alias `@/`,
 * Kassis core (`server/`), repo `tools/`, `scripts/`, or host `src/`, a relative path
 * that leaves the package (including a sibling under `packages/`), undeclared npm deps,
 * or an unverified `@kassis/*` package. `@kassis/addon-sdk` also refuses Node built-ins.
 * Other listed kit packages allow Node built-ins. No baseline: any violation fails.
 *
 * Usage: node tools/ci/check-addon-sdk-boundary.mjs
 *        npm run ci:packages:addon-sdk-boundary
 */
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);
/** @kassis/* packages verified to import nothing outside themselves (dependency order). */
const SELF_CONTAINED_KASSIS_PACKAGES = new Set([
  '@kassis/addon-sdk',
  '@kassis/adk-protocol',
  '@kassis/mcp-contract',
  '@kassis/addon-testkit',
  '@kassis/adk-core',
]);
const NODE_BUILTINS = new Set(builtinModules);

/** @type {Array<{ dir: string, label: string, allowNodeBuiltins: boolean }>} */
const KIT_PACKAGE_SCANS = [
  { dir: path.join(ROOT, 'packages', 'addon-sdk'), label: '@kassis/addon-sdk', allowNodeBuiltins: false },
  {
    dir: path.join(ROOT, 'packages', 'adk-protocol'),
    label: '@kassis/adk-protocol',
    allowNodeBuiltins: true,
  },
  {
    dir: path.join(ROOT, 'packages', 'adk-core'),
    label: '@kassis/adk-core',
    allowNodeBuiltins: true,
  },
  {
    dir: path.join(ROOT, 'packages', 'mcp-contract'),
    label: '@kassis/mcp-contract',
    allowNodeBuiltins: true,
  },
];

const IMPORT_RE =
  /(?:\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|\bexport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"])/g;

/**
 * Remove comments and string/template literals so generated scaffold snippets do not false-positive.
 * @param {string} source
 * @returns {string}
 */
export function stripLiteralBodiesForImportScan(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (ch === '`') {
      i += 1;
      while (i < source.length) {
        const cur = source[i];
        if (cur === '\\') {
          i += 2;
          continue;
        }
        if (cur === '$' && source[i + 1] === '{') {
          i += 2;
          let depth = 1;
          while (i < source.length && depth > 0) {
            const inner = source[i];
            if (inner === '"' || inner === "'" || inner === '`') {
              const nested = inner;
              i += 1;
              while (i < source.length) {
                if (source[i] === '\\') {
                  i += 2;
                  continue;
                }
                if (source[i] === nested) {
                  i += 1;
                  break;
                }
                i += 1;
              }
              continue;
            }
            if (inner === '{') depth += 1;
            if (inner === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        if (cur === '`') {
          i += 1;
          break;
        }
        i += 1;
      }
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walk(full, out);
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** `@scope/name/sub` → `@scope/name`; `name/sub` → `name`. */
function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * @param {{ packageRoot: string, file: string, spec: string, declared: Set<string>, allowNodeBuiltins: boolean }} input
 * @returns {{ code: string, reason: string } | null}
 */
function classifyImport({ packageRoot, file, spec, declared, allowNodeBuiltins }) {
  if (spec.startsWith('@/')) return { code: 'KADK-201', reason: 'host alias @/' };
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    const target = path.resolve(path.dirname(file), spec);
    if (isInside(packageRoot, target)) return null;
    const repoRoot = path.resolve(packageRoot, '../..');
    const packagesRoot = path.join(repoRoot, 'packages');
    if (isInside(packagesRoot, target) && !isInside(packageRoot, target)) {
      return { code: 'KADK-204', reason: 'sibling package by relative path' };
    }
    if (isInside(repoRoot, target)) {
      const top = path.relative(repoRoot, target).split(path.sep)[0];
      if (top === 'server') return { code: 'KADK-202', reason: 'Kassis core (server/)' };
      if (top === 'tools') return { code: 'KADK-204', reason: 'Kassis tree (tools/)' };
      if (top === 'scripts') return { code: 'KADK-204', reason: 'Kassis tree (scripts/)' };
      if (top === 'src') return { code: 'KADK-204', reason: 'Kassis tree (src/)' };
    }
    const segments = path.relative(path.dirname(packageRoot), target).split(path.sep);
    return segments.includes('server')
      ? { code: 'KADK-202', reason: 'Kassis core (server/)' }
      : { code: 'KADK-204', reason: 'relative path outside the package' };
  }
  if (spec === 'server' || spec.startsWith('server/')) {
    return { code: 'KADK-202', reason: 'Kassis core (server/)' };
  }
  if (spec === 'tools' || spec.startsWith('tools/')) {
    return { code: 'KADK-204', reason: 'Kassis tree (tools/)' };
  }
  if (spec === 'scripts' || spec.startsWith('scripts/')) {
    return { code: 'KADK-204', reason: 'Kassis tree (scripts/)' };
  }
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec)) {
    return allowNodeBuiltins ? null : { code: 'KADK-205', reason: 'Node built-in' };
  }
  const name = packageNameOf(spec);
  if (name.startsWith('@kassis/') && !SELF_CONTAINED_KASSIS_PACKAGES.has(name)) {
    return { code: 'KADK-205', reason: `${name} is not verified self-contained` };
  }
  return declared.has(name) ? null : { code: 'KADK-205', reason: `${name} is not in dependencies` };
}

/**
 * @param {Record<string, unknown>} manifest package.json
 * @returns {{ declared: Set<string>, violations: Array<{ file: string, spec: string, code: string, reason: string }> }}
 */
function readDependencies(manifest) {
  const declared = new Set();
  const violations = [];
  for (const field of ['dependencies', 'peerDependencies']) {
    const deps = manifest[field] && typeof manifest[field] === 'object' ? manifest[field] : {};
    for (const [name, range] of Object.entries(deps)) {
      declared.add(name);
      if (name.startsWith('@kassis/') && !SELF_CONTAINED_KASSIS_PACKAGES.has(name)) {
        violations.push({
          file: 'package.json',
          spec: name,
          code: 'KADK-205',
          reason: 'not verified self-contained',
        });
      }
      if (/^(?:file|link|workspace):/.test(String(range))) {
        violations.push({
          file: 'package.json',
          spec: `${name}@${range}`,
          code: 'KADK-204',
          reason: 'local path dependency',
        });
      }
    }
  }
  return { declared, violations };
}

/**
 * Checks every source file under `packageRoot` (except node_modules and dist).
 * @param {string} packageRoot
 * @param {{ allowNodeBuiltins?: boolean }} [options]
 * @returns {Array<{ file: string, spec: string, code: string, reason: string }>}
 */
export function findPackageBoundaryViolations(packageRoot, options = {}) {
  const allowNodeBuiltins = options.allowNodeBuiltins === true;
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const { declared, violations } = readDependencies(manifest);
  for (const file of walk(packageRoot)) {
    const source = stripLiteralBodiesForImportScan(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(packageRoot, file).replace(/\\/g, '/');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      if (!spec) continue;
      const violation = classifyImport({ packageRoot, file, spec, declared, allowNodeBuiltins });
      if (violation) violations.push({ file: rel, spec, ...violation });
    }
  }
  return violations;
}

function main() {
  let failed = false;
  for (const { dir, label, allowNodeBuiltins } of KIT_PACKAGE_SCANS) {
    const violations = findPackageBoundaryViolations(dir, { allowNodeBuiltins });
    if (violations.length > 0) {
      failed = true;
      console.error(
        `ci:packages:addon-sdk-boundary failed — ${violations.length} import(s) leave ${label}:\n`
      );
      for (const v of violations) console.error(`  ${v.code} ${v.file}: '${v.spec}' (${v.reason})`);
    } else {
      console.log(`ci:packages:addon-sdk-boundary OK (${walk(dir).length} files in ${path.relative(ROOT, dir)})`);
    }
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}