const killed = new Set<string>();

/** Turn an addon's slots off without unloading the host page. */
export function killAddon(addonId: string): void {
  killed.add(addonId);
}

/** Allow the addon's slots to render again. */
export function reviveAddon(addonId: string): void {
  killed.delete(addonId);
}

export function isAddonKilled(addonId: string): boolean {
  return killed.has(addonId);
}

/** Test helper. Production code does not clear the whole set. */
export function resetAddonKillSwitch(): void {
  killed.clear();
}
