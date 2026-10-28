# Addon anatomy

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Manifest

`manifest.json` is validated as manifest v2 by `kassis-addon check`. The fields an addon author sets most often:

| Field | Role |
| --- | --- |
| `id` | Addon id. Routes mount at `/api/v1/addons/<id>`. |
| `signing` | Optional `{ alg: "ed25519", keyId }`. `keyId` is the sha256 hex of the Ed25519 SPKI DER. It is inside the signed body. A first-party manifest that still has no `signing` block verifies with the kassis current key. |
| `tier` | `1` (default) or `2`. See [Tiers](./tiers.md). |
| `routing.mountPath` | Path the host passes into `initialize()`. |
| `database.ownedTables` / `database.readAccess` | Tables this addon owns or may read. Do not use a wildcard for a new addon. |
| `permissions` | Names in the addon permission namespace. See [Permission namespaces](../addons/permission-namespaces.md). |
| `ui.entryFile` | Frontend bundle entry, usually `index.js`. |
| `ui.runtimeLoad` | When true, the host loads the page from the runtime catalog instead of a static import. |
| `mcp.tools` | Tool names. Tier 2 tools are forwarded. They are not imported into the host. |

## initialize()

The loader calls `initialize()` with the platform host, the database handles, config, secrets, a logger, and `ctx`. `ctx` is the [addon context](../addons/addon-context-facades.md). Addons are not required to read `ctx`, but new code should.

Register HTTP with `host.registerRoute({ mountPath, handler })`. `mountPath` comes from the manifest. Register callable features with `host.registerCapability`. Callers use `getCapability` and must keep working when the capability is absent.

## Frontend register()

`frontend/index.ts` must export a function named `register`. The runtime loader calls `mod.register` or `mod.default.register`. It also reads `routes`. Without `register`, the page can load and still show no widgets.

```ts
import { registerExampleExtensions } from './register';
export { registerExampleExtensions };
export const register = registerExampleExtensions;
```

User-visible chrome goes through the addon i18n helpers. See [Frontend i18n](../addons/frontend-i18n.md). Do not import `i18next` from an addon.

An addon built outside this repository keeps `@kassis/host-sdk` and `@kassis/addon-ui` external. `kassis-addon init` copies `vite.config.mjs`, which reads that list from `@kassis/addon-sdk/browser-externals.json`. The host serves those modules from `/host-sdk/`.

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | Manifest v2 may carry `signing.keyId`, covered by the signature. |
