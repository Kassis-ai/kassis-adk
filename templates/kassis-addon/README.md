# __ADDON_NAME__

Addon `__ADDON_ID__`, publisher `__PUBLISHER__`. Routes mount at `/api/v1/addons/__ADDON_ID__`.

The server bundle is `dist/server/index.js`. When this addon has a UI, the host URL is `/addons-ui/__ADDON_ID__/index.js` and the built file is `frontend/dist/index.js`.

Import host types from `@kassis/addon-sdk`. Do not import `server/` or `@/features`.

`npm install` reads `@kassis` packages from GitHub Packages. Create a token with `read:packages` and set `NODE_AUTH_TOKEN` in the environment. `.npmrc` references that variable and does not store the token.
