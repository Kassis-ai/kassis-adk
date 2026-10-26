/**
 * Fail CI when @kassis/addon-sdk imports anything outside itself: the host alias `@/`, Kassis
 * core (`server/`), a relative path that leaves the package, a Node built-in, or a package not
 * declared in its own dependencies. Other @kassis/* packages are allowed only when listed in
 * SELF_CONTAINED_KASSIS_PACKAGES after checking that they are self-contained too. No baseline:
 * any violation fails.
 *
 * Usage: node tools/ci/check-addon-sdk-boundary.mjs
 *        npm run ci:packages:addon-sdk-boundary
 */
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const SDK_ROOT = path.join(ROOT, 'packages', 'addon-sdk');
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'coverage', '.git']);
/** @kassis/* packages verified to import nothing outside themselves. */
const SELF_CONTAINED_KASSIS_PACKAGES = new Set([]);
const NODE_BUILTINS = new Set(builtinModules);

const IMPORT_RE =
  /(?:\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|\bexport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"])/g;

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
 * @param {{ packageRoot: string, file: string, spec: string, declared: Set<string> }} input
 * @returns {{ code: string, reason: string } | null}
 */
function classifyImport({ packageRoot, file, spec, declared }) {
  if (spec.startsWith('@/')) return { code: 'KADK-201', reason: 'host alias @/' };
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    const target = path.resolve(path.dirname(file), spec);
    if (isInside(packageRoot, target)) return null;
    const segments = path.relative(path.dirname(packageRoot), target).split(path.sep);
    return segments.includes('server')
      ? { code: 'KADK-202', reason: 'Kassis core (server/)' }
      : { code: 'KADK-204', reason: 'relative path outside the package' };
  }
  if (spec === 'server' || spec.startsWith('server/')) {
    return { code: 'KADK-202', reason: 'Kassis core (server/)' };
  }
  if (spec.startsWith('node:') || NODE_BUILTINS.has(spec)) {
    return { code: 'KADK-205', reason: 'Node built-in' };
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
 * @returns {Array<{ file: string, spec: string, code: string, reason: string }>}
 */
export function findPackageBoundaryViolations(packageRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const { declared, violations } = readDependencies(manifest);
  for (const file of walk(packageRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = path.relative(packageRoot, file).replace(/\\/g, '/');
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      if (!spec) continue;
      const violation = classifyImport({ packageRoot, file, spec, declared });
      if (violation) violations.push({ file: rel, spec, ...violation });
    }
  }
  return violations;
}

function main() {
  const violations = findPackageBoundaryViolations(SDK_ROOT);
  if (violations.length > 0) {
    console.error(
      `ci:packages:addon-sdk-boundary failed — ${violations.length} import(s) leave @kassis/addon-sdk:\n`
    );
    for (const v of violations) console.error(`  ${v.code} ${v.file}: '${v.spec}' (${v.reason})`);
    process.exit(1);
  }
  console.log(
    `ci:packages:addon-sdk-boundary OK (${walk(SDK_ROOT).length} files in packages/addon-sdk)`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
