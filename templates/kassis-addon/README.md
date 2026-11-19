# **ADDON_NAME**

Addon `__ADDON_ID__`, publisher `__PUBLISHER__`. Routes mount at `/api/v1/addons/__ADDON_ID__`.

The server bundle is `dist/server/index.js`. When this addon has a UI, the host URL is `/addons-ui/__ADDON_ID__/index.js` and the built file is `frontend/dist/index.js`.

Import host types from `@kassis/addon-sdk`. Do not import `server/` or `@/features`.

`npm install` reads the public `@kassis` packages from npmjs.com. No token is needed. `.npmrc` pins the `@kassis` scope to that registry.
