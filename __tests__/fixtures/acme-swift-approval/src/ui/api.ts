import { getAddonApiBase } from '@kassis/host-sdk';

const ADDON_ID = 'acme-swift-approval';

export function addonUrl(path: string): string {
  const base = getAddonApiBase(ADDON_ID);
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function addonFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(addonUrl(path), {
    ...init,
    signal: AbortSignal.timeout(5000),
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}
