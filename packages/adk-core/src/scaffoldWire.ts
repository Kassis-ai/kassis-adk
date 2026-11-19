import fs from 'node:fs';
import path from 'node:path';

/**
 * Matches the addon initialize function in either template form:
 *   export async function initialize(ctx: AddonContext): Promise<void> {
 *   defineAddon({ async initialize(ctx): Promise<void> {
 * Group 1 is the line indent, group 2 the opening text up to and including `{`.
 */
const INITIALIZE_OPEN =
  /^([ \t]*)((?:export\s+)?async\s+(?:function\s+)?initialize\(ctx(?:\s*:\s*[^)]*)?\)(?:\s*:\s*Promise<void>)?\s*\{)/m;

/** The addon SDK import line. Built from a string so the boundary scan does not read it as an import. */
const SDK_IMPORT = new RegExp("^import [^\\n]*from '@kassis/addon-sdk';$", 'm');

/**
 * Add `import { fn } from './<module>.js'` and a `fn(ctx);` call at the top of
 * initialize in src/server/index.ts. Returns the file it changed, or null.
 */
export function wireInitializeCall(dir: string, fn: string, modulePath: string): string | null {
  const initFile = path.join(dir, 'src', 'server', 'index.ts');
  if (!fs.existsSync(initFile)) return null;
  let text = fs.readFileSync(initFile, 'utf8');
  if (text.includes(`${fn}(ctx)`)) return null;
  const open = INITIALIZE_OPEN.exec(text);
  if (!open) return null;
  const indent = `${open[1]}  `;
  text = text.replace(INITIALIZE_OPEN, `$1$2\n${indent}${fn}(ctx);`);
  const importLine = `import { ${fn} } from './${modulePath}.js';`;
  if (!text.includes(importLine)) {
    const sdk = SDK_IMPORT.exec(text);
    text = sdk ? text.replace(SDK_IMPORT, `${sdk[0]}\n${importLine}`) : `${importLine}\n${text}`;
  }
  fs.writeFileSync(initFile, text);
  return 'src/server/index.ts';
}
