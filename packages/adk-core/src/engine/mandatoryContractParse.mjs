/**
 * Finds canAccess and onDelete function bodies and marks stubs (S2.21).
 * A stub returns true, is empty, only throws, or carries KASSIS-MANDATORY-STUB.
 */
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function stripStrings(text) {
  return text
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function isWordAt(text, index, word) {
  if (!text.startsWith(word, index)) return false;
  const before = index === 0 ? '' : text[index - 1];
  const after = text[index + word.length] ?? '';
  return !/[\w$]/.test(before) && !/[\w$]/.test(after);
}

function findHandlerHits(text) {
  const hits = [];
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      continue;
    }
    if (isWordAt(text, i, 'canAccess')) hits.push({ name: 'canAccess', index: i });
    else if (isWordAt(text, i, 'onDelete')) hits.push({ name: 'onDelete', index: i });
  }
  return hits;
}

function skipSpace(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

function extractBalanced(text, openIndex, open, close) {
  let depth = 0;
  let quote = '';
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { end: i, inner: text.slice(openIndex + 1, i) };
    }
  }
  return null;
}

function arrowAfter(text, from) {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length - 1; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && ch === '=' && text[i + 1] === '>') return i;
    else if (depth === 0 && (ch === ';' || ch === ',' || ch === '\n')) return -1;
  }
  return -1;
}

function expressionEnd(text, from) {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (depth === 0 && (ch === ',' || ch === '\n' || ch === ';')) return i;
  }
  return text.length;
}

/**
 * @param {string} text
 * @param {number} nameIndex
 */
function readHandlerAt(text, nameIndex, name) {
  let i = skipSpace(text, nameIndex + name.length);
  if (text[i] === ':') i = skipSpace(text, i + 1);
  else if (text[i] === '=') i = skipSpace(text, i + 1);
  if (text.startsWith('async', i) && /[\s<(]/.test(text[i + 5] ?? '')) i = skipSpace(text, i + 5);
  if (text.startsWith('function', i)) {
    i = skipSpace(text, i + 8);
    if (/[A-Za-z_$]/.test(text[i] ?? '')) {
      while (i < text.length && /[\w$]/.test(text[i])) i += 1;
      i = skipSpace(text, i);
    }
  }
  if (text[i] === '<') {
    const generic = extractBalanced(text, i, '<', '>');
    if (!generic) return null;
    i = skipSpace(text, generic.end + 1);
  }
  if (text[i] !== '(') return null;
  const params = extractBalanced(text, i, '(', ')');
  if (!params) return null;
  i = skipSpace(text, params.end + 1);
  let sawArrow = false;
  if (text[i] === ':') {
    const arrow = arrowAfter(text, i);
    if (arrow < 0) return null;
    sawArrow = true;
    i = skipSpace(text, arrow + 2);
  } else if (text.startsWith('=>', i)) {
    sawArrow = true;
    i = skipSpace(text, i + 2);
  }
  if (text[i] === '{') {
    const block = extractBalanced(text, i, '{', '}');
    if (!block) return null;
    return { body: block.inner, end: block.end };
  }
  if (!sawArrow) return null;
  const end = expressionEnd(text, i);
  const body = text.slice(i, end).trim();
  if (!body) return null;
  return { body, end };
}

function isOnlyReturnTrue(body) {
  const compact = stripStrings(body).replace(/\s+/g, '');
  return (
    compact === 'true' ||
    compact === '!0' ||
    compact === 'returntrue;' ||
    compact === 'returntrue' ||
    compact === 'return!0;' ||
    compact === 'return!0' ||
    compact === 'returnPromise.resolve(true);' ||
    compact === 'returnPromise.resolve(true)' ||
    compact === 'returnPromise.resolve(!0);' ||
    compact === 'returnPromise.resolve(!0)'
  );
}

function isOnlyThrow(body) {
  const stripped = stripComments(stripStrings(body)).trim().replace(/;+\s*$/u, '');
  return /^throw\b/u.test(stripped) && !stripped.includes(';');
}

function isEmptyDelete(body) {
  const compact = stripComments(stripStrings(body)).replace(/\s+/g, '');
  return (
    compact === '' ||
    compact === 'return' ||
    compact === 'return;' ||
    compact === 'returnundefined' ||
    compact === 'returnundefined;' ||
    compact === 'returnvoid0' ||
    compact === 'returnvoid0;' ||
    compact === 'returnPromise.resolve()' ||
    compact === 'returnPromise.resolve();'
  );
}

function isStub(name, rawBody) {
  if (rawBody.includes('KASSIS-MANDATORY-STUB')) return true;
  const body = stripComments(rawBody).trim();
  if (isOnlyThrow(body)) return true;
  if (name === 'canAccess') return body === '' || isOnlyReturnTrue(body);
  return isEmptyDelete(body);
}

export function contractHandlersInSource(relative, text) {
  const hits = findHandlerHits(text);
  const handlers = [];
  let coveredUntil = -1;
  for (const hit of hits) {
    if (hit.index < coveredUntil) continue;
    const parsed = readHandlerAt(text, hit.index, hit.name);
    if (!parsed) continue;
    coveredUntil = parsed.end + 1;
    handlers.push({
      name: hit.name,
      file: relative,
      line: lineOf(text, hit.index),
      stub: isStub(hit.name, parsed.body),
    });
  }
  return handlers;
}
