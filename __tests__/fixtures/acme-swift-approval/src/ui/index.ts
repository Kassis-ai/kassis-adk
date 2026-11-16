import type { ComponentType } from 'react';
import { registerAddonLocales, settingsTabSlot } from '@kassis/host-sdk';
import { ApprovalsPage } from './pages/ApprovalsPage.js';
import { SettingsTab } from './pages/SettingsTab.js';

const ADDON_ID = 'acme-swift-approval';

interface AddonRoute {
  readonly path: string;
  readonly component: ComponentType;
  readonly pageKey: string;
  readonly pageName: string;
  readonly guard: { readonly type: 'permission'; readonly permission: string };
  readonly addon: { readonly name: string };
}

export const settingsSlot = settingsTabSlot(ADDON_ID);

export const routes: readonly AddonRoute[] = [
  {
    path: '/acme-swift-approval/approvals',
    component: ApprovalsPage,
    pageKey: 'acme-swift-approval-approvals',
    pageName: 'SWIFT approvals',
    guard: { type: 'permission', permission: 'acme-swift-approval.view' },
    addon: { name: ADDON_ID },
  },
];

export function register(): void {
  void registerAddonLocales(ADDON_ID, {
    en: () => import('./locales/en.json'),
    fr: () => import('./locales/fr.json'),
  });
}

export { ApprovalsPage, SettingsTab };
