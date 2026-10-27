export const routes = [
  {
    path: '/__ADDON_ID__',
    pageKey: '__ADDON_ID__',
    pageName: '__ADDON_NAME__',
    guard: { type: 'permission', permission: '__ADDON_ID__.view' },
    addon: { name: '__ADDON_ID__' },
  },
];
