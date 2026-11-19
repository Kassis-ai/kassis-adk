export function buildAddon(
  addonDir: string,
  options?: {
    only?: string;
    onLog?: (event: { readonly stream: 'stdout' | 'stderr'; readonly text: string }) => void;
  }
): Promise<string[]>;
