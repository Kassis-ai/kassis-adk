/**
 * Reads manifest.json from an addon directory and reports issues via validateManifestV2.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  getKadkCode,
  validateManifestV2,
  type KadkIssue as SdkKadkIssue,
} from '@kassis/addon-sdk';
import type { AdkIssue } from './types.ts';
import { isRecordValue, kadkIssue } from './issues.ts';

function toAdkIssue(issue: SdkKadkIssue): AdkIssue {
  return {
    code: issue.code,
    severity: getKadkCode(issue.code).severity,
    message: issue.message,
    fix: issue.fix,
    file: 'manifest.json',
    line: null,
  };
}

function entryFileIssues(manifest: Record<string, unknown>): AdkIssue[] {
  const ui = manifest.ui;
  if (!isRecordValue(ui) || typeof ui.entryFile !== 'string') return [];
  if (!ui.entryFile.includes('/')) return [];
  return [kadkIssue('KADK-504', 'manifest.json', null, { value: ui.entryFile })];
}

/** Schema and manifest-rule issues for one addon directory. */
export function checkManifestDirectory(dir: string): AdkIssue[] {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) {
    return [kadkIssue('KADK-102', 'manifest.json', null, { path: '', field: 'manifest.json' })];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return [
      kadkIssue('KADK-101', 'manifest.json', null, {
        path: 'manifest.json',
        detail: 'is not valid JSON',
      }),
    ];
  }
  const { issues } = validateManifestV2(parsed);
  const mapped = issues.map(toAdkIssue);
  if (!isRecordValue(parsed)) return mapped;
  return [...mapped, ...entryFileIssues(parsed)];
}
