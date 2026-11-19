export function buildAddonSbom(dir: string): {
  bomFormat: string;
  components: { name: string; version: string }[];
};
export function writeAddonSbom(dir: string): string;
