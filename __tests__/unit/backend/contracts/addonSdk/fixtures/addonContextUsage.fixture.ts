/**
 * Typechecked by addonSdkTypes.test.ts. Each @ts-expect-error line is a contract violation the
 * SDK types must reject at compile time; the other lines must compile.
 */
import type { AddonContext, AddonPrincipal, DeclareAddon } from '@kassis/addon-sdk';

import type { validManifest } from './manifestV2.fixture.js';

type Manifest = typeof validManifest;

type AssessmentCompleted = { partyId: string; score: number };
type PartyUpdated = { partyId: string };
type PartyLookup = { find(partyId: string): Promise<{ id: string; name: string } | null> };

type Declarations = DeclareAddon<
  Manifest,
  {
    publishes: { 'sample-tprm-check.assessment.completed': AssessmentCompleted };
    subscribes: { 'party.updated': PartyUpdated };
    consumes: { 'party.lookup': PartyLookup };
    config: { batchSize?: number };
  }
>;

type WithoutPublishedPayload = { publishes: {}; subscribes: { 'party.updated': PartyUpdated } };

// @ts-expect-error every published event needs a payload type
export type MissingPayload = DeclareAddon<Manifest, WithoutPublishedPayload>;

export async function initialize(
  ctx: AddonContext<Declarations>,
  principal: AddonPrincipal
): Promise<void> {
  await ctx.events.publish(principal, 'sample-tprm-check.assessment.completed', {
    partyId: 'p1',
    score: 40,
  });
  // @ts-expect-error N17: the event is not declared in events.publishes
  await ctx.events.publish(principal, 'sample-tprm-check.other', { partyId: 'p1', score: 40 });
  // @ts-expect-error N17: the payload must match the declared type
  await ctx.events.publish(principal, 'sample-tprm-check.assessment.completed', { partyId: 'p1' });

  ctx.events.subscribe('party.updated', async (event) => {
    const partyId: string = event.payload.partyId;
    await ctx.jobs.enqueue(event.principal, 'sample-tprm-check.rescreen', { partyId });
  });
  // @ts-expect-error the event is not declared in events.subscribes
  ctx.events.subscribe('case.created', async () => undefined);

  await ctx.audit.record(principal, 'sample-tprm-check.assessment.run', {
    subject: { type: 'party', id: 'p1' },
  });
  // @ts-expect-error N18: the audit action is not declared in audit.actions
  await ctx.audit.record(principal, 'case.closed', { subject: { type: 'case', id: 'c1' } });

  await ctx.llm.invoke(principal, 'sample_tprm_check.summary.v1', { partyName: 'Acme' });
  // @ts-expect-error C9: model selection belongs to AI Settings
  await ctx.llm.invoke(principal, 'sample_tprm_check.summary.v1', {}, { model: 'gpt-4' });
  // @ts-expect-error the prompt key is not declared in prompts.keys
  await ctx.llm.invoke(principal, 'fincrime.case.summary', {});

  const lookup = ctx.capabilities.consume('party.lookup');
  // @ts-expect-error consume returns null when no enabled addon provides the capability
  await lookup.find('p1');
  if (lookup) await lookup.find('p1');
  const screening: object | null = ctx.capabilities.consume('aml.screening');
  void screening;
  // @ts-expect-error the capability is not in requires or optional
  ctx.capabilities.consume('kyc.service');

  ctx.jobs.register('sample-tprm-check.rescreen', async (job) => job.data);
  // @ts-expect-error the job type is not declared in jobs.types
  ctx.jobs.register('cr_btm_daily_scan', async () => undefined);

  await ctx.secrets.get('sample-tprm-check:vendor-api-key');
  // @ts-expect-error N9: the secret key is not declared in secrets.keys
  await ctx.secrets.get('jwt_secret');

  ctx.routes.mount(() => undefined, { permission: 'sample-tprm-check.view', path: '/assessments' });
  // @ts-expect-error a route permission must be one the addon declares
  ctx.routes.mount(() => undefined, { permission: 'system.admin' });

  // @ts-expect-error principals are issued by the host, never built by the addon
  const forged: AddonPrincipal = { kind: 'user', userId: 1, email: 'admin@example.com' };
  void forged;

  const batchSize: number | undefined = ctx.config.batchSize;
  void batchSize;

  ctx.extend.registerLinkable({ ownerType: 'tprm_assessment', allowedRoles: ['subject'] });
  // @ts-expect-error N5: identity is bound by the host, there is no addonName parameter
  ctx.extend.registerLinkable({ ownerType: 'tprm_assessment', addonName: 'other-addon' });
}

/** Without declarations every name is a string; the host still checks the manifest at runtime. */
export async function untyped(ctx: AddonContext, principal: AddonPrincipal): Promise<void> {
  await ctx.events.publish(principal, 'any-addon.thing.happened', { at: '2026-10-26' });
  const capability: object | null = ctx.capabilities.consume('any.capability');
  void capability;
}
