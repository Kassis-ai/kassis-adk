/**
 * Blank comments and template-literal text before an import scan.
 * Quoted strings stay, so `from 'specifier'` is still visible.
 * `${...}` is real code and is scanned.
 * A template that is the argument of import() keeps its static path as a quoted specifier.
 *
 * @param {string} source
 * @returns {string}
 */
export function stripLiteralBodiesForImportScan(source) {
  let out = '';
  let i = 0;
  /** @type {Array<{ specifier: boolean, staticText: string }>} */
  const templates = [];
  let pendingSide = '';

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    const frame = templates[templates.length - 1];

    if (frame) {
      if (ch === '\\') {
        if (frame.specifier && next !== undefined) frame.staticText += next;
        i += 2;
        continue;
      }
      if (ch === '`') {
        if (frame.specifier && frame.staticText.length > 0) {
          const quoted = frame.staticText.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
          out += `'${quoted}'`;
        }
        templates.pop();
        i += 1;
        continue;
      }
      if (ch === '$' && next === '{') {
        const exprStart = i + 2;
        const exprEnd = endOfTemplateExpr(source, exprStart);
        const expr = stripLiteralBodiesForImportScan(source.slice(exprStart, exprEnd));
        if (frame.specifier) pendingSide += `${expr};`;
        else out += expr;
        i = exprEnd + 1;
        continue;
      }
      if (frame.specifier) frame.staticText += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/' && source[i - 1] !== '\\') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(source.length, i + 2);
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      out += ch;
      const quote = ch;
      i += 1;
      while (i < source.length) {
        const current = source[i];
        out += current;
        i += 1;
        if (current === '\\') {
          if (i < source.length) {
            out += source[i];
            i += 1;
          }
          continue;
        }
        if (current === quote) break;
      }
      continue;
    }
    if (ch === '`') {
      const specifier = /(?:^|\b)import\s*\(\s*$/.test(out);
      templates.push({ specifier, staticText: '' });
      i += 1;
      continue;
    }
    if (ch === ')' && pendingSide) {
      out += ch;
      out += pendingSide;
      pendingSide = '';
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  if (pendingSide) out += pendingSide;
  return out;
}

/**
 * Index of the `}` that closes a template interpolation starting at `start`.
 * @param {string} source
 * @param {number} start
 * @returns {number}
 */
function endOfTemplateExpr(source, start) {
  let depth = 1;
  let i = start;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/' && source[i - 1] !== '\\') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i = Math.min(source.length, i + 2);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          i = endOfTemplateExpr(source, i + 2) + 1;
          continue;
        }
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    i += 1;
  }
  return Math.max(start, i - 1);
}
