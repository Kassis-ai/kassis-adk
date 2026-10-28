import type { AddonContext } from '@kassis/addon-sdk';

export async function initialize(ctx: AddonContext): Promise<void> {
  ctx.logger.info('__ADDON_ID__ initialized');
}
