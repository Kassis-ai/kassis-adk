interface AddonRoute {
  readonly path: string;
  readonly pageKey: string;
  readonly pageName: string;
  readonly guard: { readonly type: 'permission'; readonly permission: string };
  readonly addon: { readonly name: string };
}

export const routes: readonly AddonRoute[] = [
  {
    path: '/__ADDON_ID__',
    pageKey: '__ADDON_ID__',
    pageName: '__ADDON_NAME__',
    guard: { type: 'permission', permission: '__ADDON_ID__.view' },
    addon: { name: '__ADDON_ID__' },
  },
];

export function register(): void {
  /* Host extensions are registered here. */
}
