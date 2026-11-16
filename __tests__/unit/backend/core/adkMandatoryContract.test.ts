import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scaffoldProject } from '../../../../packages/adk-core/src/scaffoldFeature.ts';
import { initAddon } from '../../../../tools/adk/scaffold.mjs';
import {
  auditMandatoryContract,
  mandatoryContractRefusal,
  writeMandatoryContractEvidence,
} from '../../../../tools/adk/mandatoryContract.mjs';
import { mandatoryContractCheck } from '../../../../tools/adk/certifyChecks.mjs';

const template = path.resolve(import.meta.dirname, '../../../..', 'templates/kassis-addon');

function writeAddon(dir: string, manifest: object, source: string): void {
  fs.mkdirSync(path.join(dir, 'src/server'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'src/server/record.ts'), source);
}

const v2 = {
  manifestVersion: 2,
  id: 'acme-widget',
  tier: 2,
  resourceTypes: [{ type: 'acme:item' }],
};

describe('mandatory record contract (S2.21)', () => {
  it('passes the template, which declares no record type', () => {
    const result = auditMandatoryContract(template);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails a fresh record-type scaffold because canAccess and onDelete only throw', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-scaffold-'));
    try {
      initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
      const scaffolded = scaffoldProject({
        dir,
        kind: 'record-type',
        id: '',
        name: 'item',
        publisher: '',
        tier: '',
        rung: '',
      });
      expect(scaffolded.ok).toBe(true);
      const result = auditMandatoryContract(dir);
      expect(result.ok).toBe(false);
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['KADK-730', 'KADK-732'])
      );
      const recorded = mandatoryContractCheck(dir) as { id: string; exitCode: number };
      expect(recorded.id).toBe('adk.mandatory-contract-intact');
      expect(recorded.exitCode).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-730 when canAccess returns true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-true-'));
    try {
      writeAddon(
        dir,
        v2,
        'export const canAccess = async () => {\n  return true;\n};\nexport const onDelete = async () => {\n  await Promise.resolve();\n};\n'
      );
      const result = auditMandatoryContract(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-730');
      expect(result.issues.map((issue) => issue.code)).not.toContain('KADK-732');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-732 when onDelete is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-empty-'));
    try {
      writeAddon(
        dir,
        v2,
        'export async function canAccess(principal: { permissions: string[] }, recordId: string) {\n  return principal.permissions.includes(recordId);\n}\nexport async function onDelete() {}\n'
      );
      const result = auditMandatoryContract(dir);
      expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-732']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes a real access decision that sometimes returns true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-real-'));
    try {
      writeAddon(
        dir,
        v2,
        'export async function canAccess(principal: { permissions: string[] }, recordId: string) {\n  if (!principal.permissions.includes("acme-widget.view")) return false;\n  return recordId.length > 0;\n}\nexport async function onDelete() {\n  await Promise.resolve();\n}\n'
      );
      const result = auditMandatoryContract(dir);
      expect(result.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-729 when a record type has no canAccess', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-missing-'));
    try {
      writeAddon(dir, v2, 'export const ready = true;\n');
      const result = auditMandatoryContract(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-729');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails KADK-731 when owned tables have no onDelete', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-tables-'));
    try {
      writeAddon(
        dir,
        {
          manifestVersion: 2,
          id: 'acme-widget',
          tier: 2,
          database: { ownedTables: ['addon_acme_widget.item'] },
        },
        'export const ready = true;\n'
      );
      const result = auditMandatoryContract(dir);
      expect(result.issues.map((issue) => issue.code)).toContain('KADK-731');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips a v1 manifest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-v1-'));
    try {
      writeAddon(
        dir,
        { id: 'list-management' },
        'export const canAccess = async () => true;\n'
      );
      expect(auditMandatoryContract(dir).ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enable refuses the scaffolded addon and allows the template path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-contract-enable-'));
    try {
      initAddon('widget', dir, { publisher: 'acme', tier: 2, rung: 1 });
      scaffoldProject({
        dir,
        kind: 'record-type',
        id: '',
        name: 'item',
        publisher: '',
        tier: '',
        rung: '',
      });
      const refused = mandatoryContractRefusal(auditMandatoryContract(dir));
      expect(refused?.code).toBe('MANDATORY_CONTRACT');
      expect(refused?.message).toContain('KADK-730');
      expect(mandatoryContractRefusal(auditMandatoryContract(template))).toBeNull();
      writeMandatoryContractEvidence(dir, auditMandatoryContract(dir).evidence);
      expect(fs.existsSync(path.join(dir, '.kassis/evidence/mandatory-contract.json'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
