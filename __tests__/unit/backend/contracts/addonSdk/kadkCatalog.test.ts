import fs from 'node:fs';
import path from 'node:path';
import {
  KADK_CATEGORY_HUNDREDS,
  fillKadkTemplate,
  getKadkCode,
  listKadkCodes,
  type KadkCode,
} from '@kassis/addon-sdk';
import { describe, expect, it } from 'vitest';

const DOCS_PAGE = 'docs/developer/technical/reference/adk-error-codes.md';
const SDK_SOURCE = path.resolve('packages/addon-sdk/src');

function docAnchors(markdown: string): string[] {
  return [...markdown.matchAll(/<a id="(kadk-\d{3})"><\/a>/g)].map((match) => match[1] ?? '');
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('KADK code catalog', () => {
  const codes = listKadkCodes();

  it('has well-formed, unique codes in the range of their category', () => {
    expect(codes.length).toBeGreaterThan(0);
    expect(new Set(codes.map((entry) => entry.code)).size).toBe(codes.length);
    for (const entry of codes) {
      expect(entry.code).toMatch(/^KADK-[1-7]\d\d$/);
      expect(Number(entry.code.charAt(5)), entry.code).toBe(KADK_CATEGORY_HUNDREDS[entry.category]);
      expect(['error', 'warning']).toContain(entry.severity);
      expect(entry.title.trim(), entry.code).not.toBe('');
      expect(entry.message.trim(), entry.code).not.toBe('');
      expect(entry.fix.trim(), entry.code).not.toBe('');
      expect(entry.docs).toBe(`${DOCS_PAGE}#${entry.code.toLowerCase()}`);
    }
  });

  it('covers every category', () => {
    const categories = new Set(codes.map((entry) => entry.category));
    expect([...categories].sort()).toEqual(Object.keys(KADK_CATEGORY_HUNDREDS).sort());
  });

  it('has one documented anchor per code and no extra anchors', () => {
    const markdown = fs.readFileSync(path.resolve(DOCS_PAGE), 'utf8');
    const anchors = docAnchors(markdown);
    expect(new Set(anchors).size).toBe(anchors.length);
    expect([...anchors].sort()).toEqual(codes.map((entry) => entry.code.toLowerCase()).sort());
    for (const entry of codes) {
      expect(markdown, entry.code).toContain(`### ${entry.code} ${entry.title}`);
    }
  });

  it('defines every code the SDK source emits', () => {
    const emitted = new Set(
      sourceFiles(SDK_SOURCE).flatMap(
        (file) => fs.readFileSync(file, 'utf8').match(/KADK-\d{3}/g) ?? []
      )
    );
    const known = new Set(codes.map((entry) => entry.code));
    expect([...emitted].filter((code) => !known.has(code as KadkCode))).toEqual([]);
  });

  it('rejects an unknown code and fills only known template slots', () => {
    expect(() => getKadkCode('KADK-999')).toThrow(RangeError);
    expect(fillKadkTemplate('{path} needs {field}', { path: 'jobs' })).toBe('jobs needs {field}');
  });
});
