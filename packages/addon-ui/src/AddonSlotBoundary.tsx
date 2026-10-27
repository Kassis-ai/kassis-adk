import { Component, type ReactNode } from 'react';

import { isAddonKilled } from './killSwitch';

export type AddonSlotBoundaryProps = {
  addonId: string;
  children?: ReactNode;
  /** Shown when the slot throws. The rest of the page keeps rendering. */
  fallback?: ReactNode;
  /** Shown when the kill switch is on for this addon. */
  killedFallback?: ReactNode;
};

type CatchState = { failed: boolean };

class SlotCatch extends Component<AddonSlotBoundaryProps, CatchState> {
  state: CatchState = { failed: false };

  static getDerivedStateFromError(): CatchState {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    // Isolated from the host page, but the message has to be visible when a slot fails.
    console.error(`[addon-slot] ${this.props.addonId}: ${error.message}`);
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/** One addon's UI. A throw or a kill switch stays inside this slot. */
export function AddonSlotBoundary({
  addonId,
  children,
  fallback = null,
  killedFallback = null,
}: AddonSlotBoundaryProps): React.JSX.Element {
  if (isAddonKilled(addonId)) return <>{killedFallback}</>;
  return (
    <SlotCatch addonId={addonId} fallback={fallback} killedFallback={killedFallback}>
      {children}
    </SlotCatch>
  );
}
