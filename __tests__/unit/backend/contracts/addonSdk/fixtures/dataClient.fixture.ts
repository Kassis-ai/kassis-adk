/**
 * Typechecked by addonSdkTypes.test.ts. Tier 2 manifests narrow ctx.data to parameterised SQL;
 * Prisma helpers are compile-time errors on tier 2.
 */
import type { AddonContext, DeclareAddon } from '@kassis/addon-sdk';

import type { validManifest } from './manifestV2.fixture.js';

type AssessmentCompleted = { partyId: string; score: number };
type PartyUpdated = { partyId: string };

type Tier2Declarations = DeclareAddon<
  typeof validManifest,
  {
    publishes: { 'sample-tprm-check.assessment.completed': AssessmentCompleted };
    subscribes: { 'party.updated': PartyUpdated };
  }
>;

export async function tier2DataUsage(ctx: AddonContext<Tier2Declarations>): Promise<void> {
  const { rows: listed } = await ctx.data.read('assessments', { limit: 10 });
  void listed;
  const { rows } = await ctx.data.query('SELECT id FROM assessments WHERE score > $1', [50]);
  void rows;
  const { count } = await ctx.data.execute('DELETE FROM assessments WHERE id = $1', ['a1']);
  void count;
  await ctx.data.transaction([
    { op: 'execute', sql: 'INSERT INTO assessments (id) VALUES ($1)', params: ['a2'] },
    { op: 'query', sql: 'SELECT id FROM assessments' },
  ]);
  // @ts-expect-error tier 2 refuses Prisma ctx.data.$queryRaw
  await ctx.data.$queryRaw`SELECT 1`;
  // @ts-expect-error tier 2 refuses Prisma ctx.data.$executeRaw
  await ctx.data.$executeRaw`DELETE FROM assessments`;
  // @ts-expect-error tier 2 refuses Prisma ctx.data.$transaction
  await ctx.data.$transaction(async () => undefined);
}

type Tier1Manifest = Omit<typeof validManifest, 'tier'> & { readonly tier: 1 };
type Tier1Declarations = DeclareAddon<
  Tier1Manifest,
  {
    publishes: { 'sample-tprm-check.assessment.completed': AssessmentCompleted };
    subscribes: { 'party.updated': PartyUpdated };
  }
>;

export async function tier1DataUsage(
  ctx: AddonContext<Tier1Declarations>
): Promise<void> {
  const updated = await ctx.data.$executeRaw`UPDATE assessments SET score = 1`;
  void updated;
  // @ts-expect-error tier 1 refuses parameterised ctx.data.query
  await ctx.data.query('SELECT 1');
}