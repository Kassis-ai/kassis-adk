import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findPackageBoundaryViolations,
  publicKeyCopyDrift,
  stripLiteralBodiesForImportScan,
} from '../../../../../tools/ci/check-addon-sdk-boundary.mjs';

const tempDirs: string[] = [];

/** A throwaway package `<tmp>/pkg` with the given source files and dependencies. */
function tempPackage(
  files: Record<string, string>,
  dependencies: Record<string, string> = {}
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-sdk-boundary-'));
  tempDirs.push(root);
  const packageRoot = path.join(root, 'pkg');
  fs.mkdirSync(path.join(packageRoot, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'fixture', dependencies })
  );
  for (const [rel, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(packageRoot, rel)), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, rel), source);
  }
  return packageRoot;
}

function codes(packageRoot: string): string[] {
  return findPackageBoundaryViolations(packageRoot).map(
    (violation) => `${violation.code} ${violation.spec}`
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('ci:packages:addon-sdk-boundary', () => {
  it.each([
    ['packages/addon-sdk', {}],
    ['packages/addon-testkit', { allowNodeBuiltins: true }],
    ['packages/adk-protocol', { allowNodeBuiltins: true }],
    ['packages/adk-core', { allowNodeBuiltins: true }],
    ['packages/mcp-contract', { allowNodeBuiltins: true }],
  ] as const)('passes the real package at %s', (rel, options) => {
    expect(findPackageBoundaryViolations(path.resolve(rel), options)).toEqual([]);
  });

  it('ignores import syntax inside template text and keeps real imports', () => {
    const hidden = 'const tpl = `import x from "../../server/index.js";`;';
    expect(stripLiteralBodiesForImportScan(hidden).includes('import')).toBe(false);
    const interpolated = 'export const x = `pre ${import("../../server/index.js")}`;';
    expect(stripLiteralBodiesForImportScan(interpolated)).toContain(
      'import("../../server/index.js")'
    );
    const specifier = 'export const y = import(`../../server/${name}.js`);';
    expect(stripLiteralBodiesForImportScan(specifier)).toContain("import('../../server/.js')");
    const url = 'const s = "http://example.com"; import { x } from "../../server/index.js";';
    expect(stripLiteralBodiesForImportScan(url)).toContain('from "../../server/index.js"');
  });

  // kassis-adk has no host copy to compare against; the host repository runs this check.
  it.skipIf(!fs.existsSync(path.resolve('server/keys/addon_verification_public.key')))('keeps the vendored public key identical to the host copy', () => {
    expect(publicKeyCopyDrift()).toBe('');
  });

  it('passes imports inside the package and declared dependencies', () => {
    const root = tempPackage(
      {
        'src/a.ts':
          "import { b } from './b.js';\nimport { Ajv2020 } from 'ajv/dist/2020.js';\nexport const a = b;",
        'src/b.ts':
          "import data from '../codes/data.json' with { type: 'json' };\nexport const b = data;",
      },
      { ajv: '^8.17.1' }
    );
    expect(codes(root)).toEqual([]);
  });

  it('fails on the host alias @/ (KADK-201) and on Kassis core (KADK-202)', () => {
    const root = tempPackage({
      'src/bad.ts': [
        "import { x } from '@/shared/x';",
        "import type { Y } from '../../server/core/types/addonPlatform.js';",
        "export { z } from 'server/core/z.js';",
        "const lazy = () => import('../../server/index.js');",
      ].join('\n'),
    });
    expect(codes(root)).toEqual([
      'KADK-201 @/shared/x',
      'KADK-202 ../../server/core/types/addonPlatform.js',
      'KADK-202 server/core/z.js',
      'KADK-202 ../../server/index.js',
    ]);
  });

  it('fails on an import inside a template interpolation (KADK-202)', () => {
    const root = tempPackage({
      'src/bad.ts': 'export const x = `pre ${import("../../server/index.js")}`;',
    });
    expect(codes(root)).toEqual(['KADK-202 ../../server/index.js']);
  });

  it('fails on a template import specifier that leaves the package (KADK-202)', () => {
    const root = tempPackage({
      'src/bad.ts': 'export const y = import(`../../server/${name}.js`);',
    });
    expect(codes(root)).toEqual(['KADK-202 ../../server/.js']);
  });

  it('fails on a relative path that leaves the package (KADK-204)', () => {
    const root = tempPackage({
      'src/bad.ts': "import { t } from '../../packages/types/src/index.js';",
    });
    expect(codes(root)).toEqual(['KADK-204 ../../packages/types/src/index.js']);
  });

  it('fails on repo tools/, scripts/, and src/ (KADK-204)', () => {
    const root = tempPackage({
      'src/bad.ts': [
        "import { a } from '../../../tools/adk/foo.mjs';",
        "import { b } from 'tools/ci/bar.mjs';",
        "import { c } from '../../../src/config/api.ts';",
        "import { d } from 'scripts/deploy/x.mjs';",
      ].join('\n'),
    });
    expect(codes(root)).toEqual([
      'KADK-204 ../../../tools/adk/foo.mjs',
      'KADK-204 tools/ci/bar.mjs',
      'KADK-204 ../../../src/config/api.ts',
      'KADK-204 scripts/deploy/x.mjs',
    ]);
  });

  it('allows Node built-ins when allowNodeBuiltins is set', () => {
    const root = tempPackage({
      'src/ok.mjs': "import fs from 'node:fs';\nexport const x = fs;",
    });
    expect(findPackageBoundaryViolations(root, { allowNodeBuiltins: true })).toEqual([]);
    expect(codes(root)).toEqual(['KADK-205 node:fs']);
  });

  it('fails on undeclared packages, Node built-ins and unverified @kassis packages (KADK-205)', () => {
    const root = tempPackage(
      {
        'src/bad.ts': [
          "import express from 'express';",
          "import fs from 'node:fs';",
          "import { McpContext } from '@kassis/mcp-contract';",
        ].join('\n'),
      },
      { '@kassis/types': 'workspace:*' }
    );
    expect(codes(root)).toEqual([
      'KADK-205 @kassis/types',
      'KADK-204 @kassis/types@workspace:*',
      'KADK-205 express',
      'KADK-205 node:fs',
      'KADK-205 @kassis/mcp-contract',
    ]);
  });
});
