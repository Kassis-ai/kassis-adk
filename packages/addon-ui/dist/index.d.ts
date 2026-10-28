import { default as React_2 } from 'react';
import { ReactNode } from 'react';

/** One addon's UI. A throw or a kill switch stays inside this slot. */
export declare function AddonSlotBoundary({ addonId, children, fallback, killedFallback, }: AddonSlotBoundaryProps): React.JSX.Element;

export declare type AddonSlotBoundaryProps = {
    addonId: string;
    children?: ReactNode;
    /** Shown when the slot throws. The rest of the page keeps rendering. */
    fallback?: ReactNode;
    /** Shown when the kill switch is on for this addon. */
    killedFallback?: ReactNode;
};

/** Shared selection chrome. Hosts keep their own actions and styling. */
export declare function BulkActionBar({ selectedCount, className, children, }: BulkActionBarProps): React_2.JSX.Element | null;

export declare interface BulkActionBarProps {
    selectedCount: number;
    className: string;
    children: React_2.ReactNode;
}

export declare function isAddonKilled(addonId: string): boolean;

/** Turn an addon's slots off without unloading the host page. */
export declare function killAddon(addonId: string): void;

/** Test helper. Production code does not clear the whole set. */
export declare function resetAddonKillSwitch(): void;

/** Allow the addon's slots to render again. */
export declare function reviveAddon(addonId: string): void;

export { }
