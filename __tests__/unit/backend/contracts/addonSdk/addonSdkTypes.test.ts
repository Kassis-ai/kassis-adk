/**
 * Compiles the SDK contract fixtures with the TypeScript compiler (no emit). The fixtures use
 * @ts-expect-error for every violation the types must reject, so zero diagnostics means the
 * valid usage compiles and every violation is caught.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  noUncheckedIndexedAccess: true,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  resolveJsonModule: true,
  skipLibCheck: true,
  types: [],
};

function diagnosticsFor(fileNames: string[]): string[] {
  const program = ts.createProgram(fileNames, COMPILER_OPTIONS);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${path.basename(diagnostic.file.fileName)}:${line + 1} ${message}`;
  });
}

describe('@kassis/addon-sdk types', () => {
  it('accept a valid manifest and context usage and reject every marked violation', () => {
    const diagnostics = diagnosticsFor([
      path.join(FIXTURES, 'manifestV2.fixture.ts'),
      path.join(FIXTURES, 'addonContextUsage.fixture.ts'),
      path.join(FIXTURES, 'dataClient.fixture.ts'),
      path.join(FIXTURES, 'defineAddon.fixture.ts'),
    ]);

    expect(diagnostics).toEqual([]);
  }, 60_000);
});
