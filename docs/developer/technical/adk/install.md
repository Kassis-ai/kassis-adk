# Install

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Prerequisites

- Node.js 24 (the server image is `node:24.18.1`). The CLI itself runs on the Node that ships with the repo.
- Docker, when you want the local stack. Rebuild with `cmd /c "rebuild.bat -fb < nul"` from the repo root. Do not use `docker compose build` in place of that script.

## Packages

The public packages are `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/addon-ui`, `@kassis/host-sdk`, `@kassis/agent-kit`, and `@kassis/addon-cli`. They publish to GitHub Packages (`publishConfig.registry` is `https://npm.pkg.github.com`). Copy [`.npmrc.example`](../../../../.npmrc.example) to `.npmrc` and set `NODE_AUTH_TOKEN` in the environment. Do not commit a token.

Each package builds to `dist`. `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/agent-kit`, and `@kassis/addon-cli` publish JavaScript. `@kassis/host-sdk` and `@kassis/addon-ui` publish type declarations plus a small JavaScript shim so plain Node can import the package. The shim does not contain the host UI. The running host serves `@kassis/host-sdk` at `/host-sdk/index.js` and `@kassis/addon-ui` at `/host-sdk/addon-ui.js`. An addon frontend build leaves those imports external.

Inside this repository, each public package's `exports` point at TypeScript source so the server can load them without a package build. `publishConfig` rewrites a packed install to `dist`, which is JavaScript.

```bash
npm install @kassis/addon-sdk @kassis/addon-testkit @kassis/addon-ui @kassis/host-sdk @kassis/agent-kit @kassis/addon-cli
```

Offline, run `npm run build` in each package, then pack the tarballs and install them elsewhere. `@kassis/addon-cli` also runs `prepack`, which copies the CLI, the template, and the schema into the tarball:

```bash
npm pack --pack-destination ./packs ./packages/addon-sdk
npm pack --pack-destination ./packs ./packages/addon-testkit
npm pack --pack-destination ./packs ./packages/addon-ui
npm pack --pack-destination ./packs ./packages/host-sdk
npm pack --pack-destination ./packs ./packages/agent-kit
npm pack --pack-destination ./packs ./packages/addon-cli
```

`npm publish` for each of the six packages requests [provenance](./publishing.md). `node scripts/pack-public-packages.mjs` builds them, packs the tarballs, installs those tarballs in an empty folder, imports each entry with plain Node, and type-checks the public subpaths.

## CLI

In this repository, `kassis-addon` is `tools/adk/kassis-addon.mjs`. `npm run create-addon` forwards to `init`.

Outside the repository, install `@kassis/addon-cli` and run `npx kassis-addon`. That package does not contain the private signing key. `sign` without `--key` exits 1 there.

## Air-gapped bundle

```bash
node tools/adk/airgap-bundle.mjs --out=./airgap
```

The bundle contains the SDK, the testkit, the CLI, the template, the public verification key, and `sbom.json`. It refuses to include the private signing key.

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | The six public packages build to `dist` and publish to GitHub Packages. `host-sdk` and `addon-ui` publish types and a Node shim. The host still serves the runtime. |
