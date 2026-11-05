/**
 * One import boundary for an addon directory.
 *
 * es-module-lexer reads static import, dynamic import(), and export-from in
 * JavaScript. It does not report require(), so the TypeScript scanner records
 * those calls. TypeScript files use the scanner for every form, because the
 * lexer only accepts JavaScript.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
import { initSync, parse } from 'es-module-lexer';
initSync();
const ALLOWED_PACKAGES = new Set([
    '@kassis/addon-sdk',
    '@kassis/host-sdk',
    '@kassis/addon-ui',
    '@kassis/agent-kit',
]);
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git']);
const BUILT_ENTRIES = ['dist/server/index.js', 'frontend/dist/index.js'];
const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.js'];
const VIRTUAL_ADDON_DIR = path.join(path.parse(process.cwd()).root, 'kassis-virtual-addon');
const REASONS = {
    'KADK-201': 'which is host source',
    'KADK-202': 'which is Kassis core (server/)',
    'KADK-203': 'which skips the capability access check',
    'KADK-204': 'which resolves outside the package',
    'KADK-205': 'which is not declared in the package dependencies',
};
/**
 * @typedef {'KADK-201' | 'KADK-202' | 'KADK-203' | 'KADK-204' | 'KADK-205'} ImportCode
 * @typedef {object} AddonImportIssue
 * @property {ImportCode} code
 * @property {string} file
 * @property {number} line
 * @property {string} specifier
 * @property {string} message
 * @typedef {object} FoundSpecifier
 * @property {string} specifier
 * @property {number} index
 */
/**
 * @param {string} source
 * @param {string} [label]
 * @returns {void}
 */
export function assertNoHostImports(source, label = 'source') {
    const issues = importIssuesInSource({
        source,
        relativeFile: moduleLabel(label),
        addonDir: VIRTUAL_ADDON_DIR,
        declared: new Set(),
    });
    if (issues.length > 0) {
        const issue = issues[0];
        throw new Error(`${issue.code} ${label}:${issue.line} imports '${issue.specifier}'`);
    }
}
/**
 * @param {string} addonDir
 * @returns {AddonImportIssue[]}
 */
export function checkAddonImports(addonDir) {
    const root = path.resolve(addonDir);
    const declared = declaredPackages(root);
    /** @type {string[]} */
    const files = [];
    walk(path.join(root, 'src'), files);
    walk(path.join(root, 'frontend'), files);
    for (const relative of BUILT_ENTRIES) {
        const full = path.join(root, ...relative.split('/'));
        if (fs.existsSync(full) && !files.includes(full))
            files.push(full);
    }
    /** @type {AddonImportIssue[]} */
    const issues = [];
    for (const file of files) {
        const relativeFile = path.relative(root, file).split(path.sep).join('/');
        const source = fs.readFileSync(file, 'utf8');
        issues.push(...importIssuesInSource({ source, relativeFile, addonDir: root, declared }));
    }
    issues.sort(compareIssues);
    return dedupe(issues);
}
/**
 * @param {object} input
 * @param {string} input.source
 * @param {string} input.relativeFile
 * @param {string} input.addonDir
 * @param {Set<string>} input.declared
 * @returns {AddonImportIssue[]}
 */
function importIssuesInSource(input) {
    const absoluteFile = path.resolve(input.addonDir, ...input.relativeFile.split('/'));
    const serverCode = isServerCode(input.relativeFile);
    /** @type {AddonImportIssue[]} */
    const issues = [];
    for (const found of specifiersIn(input.source, input.relativeFile)) {
        const issue = classifySpecifier({
            specifier: found.specifier,
            line: lineAt(input.source, found.index),
            relativeFile: input.relativeFile,
            absoluteFile,
            addonDir: input.addonDir,
            declared: input.declared,
            serverCode,
        });
        if (issue)
            issues.push(issue);
    }
    return issues;
}
/**
 * @param {string} source
 * @param {string} relativeFile
 * @returns {FoundSpecifier[]}
 */
function specifiersIn(source, relativeFile) {
    if (isTypeScriptFile(relativeFile))
        return scanSpecifiers(source, relativeFile, false);
    try {
        const [imports] = parse(source, relativeFile);
        /** @type {FoundSpecifier[]} */
        const found = [];
        for (const item of imports) {
            if (item.d === -2 || !item.n)
                continue;
            found.push({ specifier: item.n, index: item.s >= 0 ? item.s : 0 });
        }
        found.push(...scanSpecifiers(source, relativeFile, true));
        return found;
    }
    catch {
        return scanSpecifiers(source, relativeFile, false);
    }
}
/**
 * @param {string} source
 * @param {string} relativeFile
 * @param {boolean} requireOnly
 * @returns {FoundSpecifier[]}
 */
function scanSpecifiers(source, relativeFile, requireOnly) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, languageVariant(relativeFile), source);
    /** @type {FoundSpecifier[]} */
    const found = [];
    const record = () => {
        found.push({ specifier: scanner.getTokenValue(), index: scanner.getTokenPos() });
    };
    let token = scanner.scan();
    while (token !== ts.SyntaxKind.EndOfFileToken) {
        if (!requireOnly && token === ts.SyntaxKind.ImportKeyword) {
            token = consumeImport(scanner, record);
            continue;
        }
        if (!requireOnly && token === ts.SyntaxKind.ExportKeyword) {
            token = consumeExport(scanner, record);
            continue;
        }
        if (token === ts.SyntaxKind.RequireKeyword) {
            token = consumeRequire(scanner, record);
            continue;
        }
        token = scanner.scan();
    }
    return found;
}
/**
 * @param {ts.Scanner} scanner
 * @param {() => void} record
 * @returns {ts.SyntaxKind}
 */
function consumeImport(scanner, record) {
    let token = scanner.scan();
    if (token === ts.SyntaxKind.OpenParenToken)
        return consumeCallSpecifier(scanner, record);
    if (token === ts.SyntaxKind.DotToken) {
        scanner.scan();
        const afterName = scanner.scan();
        if (afterName === ts.SyntaxKind.OpenParenToken)
            return consumeCallSpecifier(scanner, record);
        return afterName;
    }
    while (token !== ts.SyntaxKind.EndOfFileToken &&
        token !== ts.SyntaxKind.FromKeyword &&
        !isStringToken(token) &&
        token !== ts.SyntaxKind.SemicolonToken) {
        token = scanner.scan();
    }
    if (token === ts.SyntaxKind.FromKeyword)
        token = scanner.scan();
    if (isStringToken(token)) {
        record();
        token = scanner.scan();
    }
    return token;
}
/**
 * @param {ts.Scanner} scanner
 * @param {() => void} record
 * @returns {ts.SyntaxKind}
 */
function consumeExport(scanner, record) {
    let token = scanner.scan();
    if (isExportDeclaration(token))
        return token;
    if (token === ts.SyntaxKind.TypeKeyword) {
        const afterType = scanner.scan();
        if (afterType !== ts.SyntaxKind.OpenBraceToken && afterType !== ts.SyntaxKind.AsteriskToken) {
            return afterType;
        }
        token = afterType;
    }
    while (token !== ts.SyntaxKind.EndOfFileToken && token !== ts.SyntaxKind.SemicolonToken) {
        if (token === ts.SyntaxKind.FromKeyword) {
            token = scanner.scan();
            if (isStringToken(token)) {
                record();
                token = scanner.scan();
            }
            return token;
        }
        if (token === ts.SyntaxKind.ImportKeyword ||
            token === ts.SyntaxKind.ExportKeyword ||
            token === ts.SyntaxKind.RequireKeyword) {
            return token;
        }
        token = scanner.scan();
    }
    if (token === ts.SyntaxKind.SemicolonToken)
        return scanner.scan();
    return token;
}
/**
 * @param {ts.Scanner} scanner
 * @param {() => void} record
 * @returns {ts.SyntaxKind}
 */
function consumeRequire(scanner, record) {
    let token = scanner.scan();
    if (token !== ts.SyntaxKind.OpenParenToken)
        return token;
    return consumeCallSpecifier(scanner, record);
}
/**
 * The current token is the opening parenthesis of import() or require().
 * @param {ts.Scanner} scanner
 * @param {() => void} record
 * @returns {ts.SyntaxKind}
 */
function consumeCallSpecifier(scanner, record) {
    const token = scanner.scan();
    if (!isStringToken(token))
        return token;
    record();
    return scanner.scan();
}
/**
 * @param {ts.SyntaxKind} token
 * @returns {boolean}
 */
function isExportDeclaration(token) {
    return (token === ts.SyntaxKind.DefaultKeyword ||
        token === ts.SyntaxKind.ClassKeyword ||
        token === ts.SyntaxKind.FunctionKeyword ||
        token === ts.SyntaxKind.ConstKeyword ||
        token === ts.SyntaxKind.LetKeyword ||
        token === ts.SyntaxKind.VarKeyword ||
        token === ts.SyntaxKind.EnumKeyword ||
        token === ts.SyntaxKind.InterfaceKeyword ||
        token === ts.SyntaxKind.NamespaceKeyword ||
        token === ts.SyntaxKind.AbstractKeyword ||
        token === ts.SyntaxKind.AsyncKeyword ||
        token === ts.SyntaxKind.DeclareKeyword ||
        token === ts.SyntaxKind.ModuleKeyword);
}
/**
 * @param {ts.SyntaxKind} token
 * @returns {boolean}
 */
function isStringToken(token) {
    return (token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral);
}
/**
 * @param {object} input
 * @param {string} input.specifier
 * @param {number} input.line
 * @param {string} input.relativeFile
 * @param {string} input.absoluteFile
 * @param {string} input.addonDir
 * @param {Set<string>} input.declared
 * @param {boolean} input.serverCode
 * @returns {AddonImportIssue | null}
 */
function classifySpecifier(input) {
    const specifier = portableSpecifier(input.specifier);
    if (!specifier)
        return null;
    if (specifier.startsWith('@/'))
        return issue(input, 'KADK-201');
    if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
        const target = path.resolve(path.dirname(input.absoluteFile), specifier);
        if (isInside(input.addonDir, target))
            return null;
        if (isCapabilityRegistry(specifier) || isCapabilityRegistry(target))
            return issue(input, 'KADK-203');
        const fromParent = path.relative(path.dirname(input.addonDir), target);
        if (fromParent.split(path.sep).includes('server'))
            return issue(input, 'KADK-202');
        return issue(input, 'KADK-204');
    }
    if (isCapabilityRegistry(specifier))
        return issue(input, 'KADK-203');
    if (specifier === 'server' || specifier.startsWith('server/'))
        return issue(input, 'KADK-202');
    if (isBuiltin(specifier))
        return input.serverCode ? null : issue(input, 'KADK-205');
    const packageName = packageNameOf(specifier);
    if (ALLOWED_PACKAGES.has(packageName) || input.declared.has(packageName))
        return null;
    return issue(input, 'KADK-205');
}
/**
 * @param {object} input
 * @param {string} input.specifier
 * @param {number} input.line
 * @param {string} input.relativeFile
 * @param {ImportCode} code
 * @returns {AddonImportIssue}
 */
function issue(input, code) {
    return {
        code,
        file: input.relativeFile,
        line: input.line,
        specifier: input.specifier,
        message: `imports '${input.specifier}', ${REASONS[code]}`,
    };
}
/**
 * @param {string} specifier
 * @returns {string}
 */
function portableSpecifier(specifier) {
    const query = specifier.indexOf('?');
    const hash = specifier.indexOf('#');
    let end = specifier.length;
    if (query !== -1 && query < end)
        end = query;
    if (hash !== -1 && hash < end)
        end = hash;
    return specifier.slice(0, end).replaceAll('\\', '/');
}
/**
 * @param {string} specifier
 * @returns {boolean}
 */
function isCapabilityRegistry(specifier) {
    const bare = portableSpecifier(specifier);
    const base = bare.slice(bare.lastIndexOf('/') + 1);
    const stem = stripModuleExtension(base);
    return stem === 'capabilityAccess' || stem === 'AddonCapabilityRegistry';
}
/**
 * @param {string} base
 * @returns {string}
 */
function stripModuleExtension(base) {
    for (const extension of MODULE_EXTENSIONS) {
        if (base.endsWith(extension))
            return base.slice(0, -extension.length);
    }
    return base;
}
/**
 * @param {string} specifier
 * @returns {string}
 */
function packageNameOf(specifier) {
    if (specifier.startsWith('@')) {
        const slash = specifier.indexOf('/');
        if (slash === -1)
            return specifier;
        const second = specifier.indexOf('/', slash + 1);
        return second === -1 ? specifier : specifier.slice(0, second);
    }
    const slash = specifier.indexOf('/');
    return slash === -1 ? specifier : specifier.slice(0, slash);
}
/**
 * @param {string} root
 * @param {string} target
 * @returns {boolean}
 */
function isInside(root, target) {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
/**
 * @param {string} relativeFile
 * @returns {boolean}
 */
function isServerCode(relativeFile) {
    return !relativeFile.startsWith('frontend/') && !relativeFile.startsWith('src/ui/');
}
/**
 * @param {string} relativeFile
 * @returns {boolean}
 */
function isTypeScriptFile(relativeFile) {
    const extension = path.posix.extname(relativeFile);
    return (extension === '.ts' || extension === '.tsx' || extension === '.mts' || extension === '.cts');
}
/**
 * @param {string} relativeFile
 * @returns {ts.LanguageVariant}
 */
function languageVariant(relativeFile) {
    const extension = path.posix.extname(relativeFile);
    if (extension === '.tsx' || extension === '.jsx')
        return ts.LanguageVariant.JSX;
    return ts.LanguageVariant.Standard;
}
/**
 * @param {string} addonDir
 * @returns {Set<string>}
 */
function declaredPackages(addonDir) {
    /** @type {Set<string>} */
    const declared = new Set();
    const manifestPath = path.join(addonDir, 'package.json');
    if (!fs.existsSync(manifestPath))
        return declared;
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    catch {
        return declared;
    }
    if (!manifest || typeof manifest !== 'object')
        return declared;
    for (const field of DEPENDENCY_FIELDS) {
        const value = manifest[field];
        if (!value || typeof value !== 'object' || Array.isArray(value))
            continue;
        for (const name of Object.keys(value))
            declared.add(name);
    }
    return declared;
}
/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {void}
 */
function walk(dir, out) {
    if (!fs.existsSync(dir))
        return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRECTORIES.has(entry.name))
                continue;
            walk(path.join(dir, entry.name), out);
            continue;
        }
        if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name)))
            continue;
        if (entry.name.endsWith('.d.ts') ||
            entry.name.endsWith('.d.mts') ||
            entry.name.endsWith('.d.cts'))
            continue;
        out.push(path.join(dir, entry.name));
    }
}
/**
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
function lineAt(source, index) {
    let line = 1;
    const end = index < 0 ? 0 : Math.min(index, source.length);
    for (let cursor = 0; cursor < end; cursor += 1) {
        if (source.charCodeAt(cursor) === 10)
            line += 1;
    }
    return line;
}
/**
 * @param {string} label
 * @returns {string}
 */
function moduleLabel(label) {
    const posix = label.replaceAll('\\', '/');
    if (MODULE_EXTENSIONS.some((extension) => posix.endsWith(extension)))
        return posix;
    return `${posix}.ts`;
}
/**
 * @param {AddonImportIssue} left
 * @param {AddonImportIssue} right
 * @returns {number}
 */
function compareIssues(left, right) {
    if (left.file !== right.file)
        return left.file < right.file ? -1 : 1;
    if (left.line !== right.line)
        return left.line - right.line;
    if (left.specifier !== right.specifier)
        return left.specifier < right.specifier ? -1 : 1;
    return left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
}
/**
 * @param {AddonImportIssue[]} issues
 * @returns {AddonImportIssue[]}
 */
function dedupe(issues) {
    /** @type {AddonImportIssue[]} */
    const unique = [];
    const seen = new Set();
    for (const issue of issues) {
        const key = `${issue.file}:${issue.line}:${issue.code}:${issue.specifier}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(issue);
    }
    return unique;
}
