type AddonHost = {
  log: { info: (message: string) => void };
};

export async function initialize(ctx: AddonHost): Promise<void> {
  ctx.log.info('__ADDON_ID__ initialized');
}
