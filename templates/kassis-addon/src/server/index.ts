import { defineAddon } from '@kassis/addon-sdk';

const addon = defineAddon({
  async initialize(ctx): Promise<void> {
    ctx.logger.info('__ADDON_ID__ initialized');
  },
});

export const initialize = addon.initialize;
