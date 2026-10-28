# Install

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Prerequisites

- Node.js 24 (the server image is `node:24.18.1`). The CLI itself runs on the Node that ships with the repo.
- Docker, when you want the local stack. Rebuild with `cmd /c "rebuild.bat -fb < nul"` from the repo root. Do not use `docker compose build` in place of that script.

## Packages

The public packages are `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/addon-ui`, `@kassis/host-sdk`, `@kassis/agent-kit`, and `@kassis/addon-cli`. They are private and publish to GitHub Packages. Copy [`.npmrc.example`](../../../../.npmrc.example) to `.npmrc` and set `NODE_AUTH_TOKEN` in the environment. Do not commit a token.

`@kassis/host-sdk` publishes type declarations only. The running host serves the implementation at `/host-sdk/index.js`. An addon frontend build leaves that import external.

```bash
npm install @kassis/addon-sdk @kassis/addon-testkit @kassis/addon-ui @kassis/host-sdk @kassis/agent-kit @kassis/addon-cli
```

Offline, pack them in the repo and install the tarballs elsewhere:

```bash
npm pack --pack-destination ./packs ./packages/addon-sdk
npm pack --pack-destination ./packs ./packages/addon-testkit
npm pack --pack-destination ./packs ./packages/addon-ui
npm pack --pack-destination ./packs ./packages/host-sdk
npm pack --pack-destination ./packs ./packages/agent-kit
npm pack --pack-destination ./packs ./packages/addon-cli
```

`npm publish` for `@kassis/addon-sdk` and `@kassis/addon-testkit` requests [provenance](./publishing.md).

## CLI

In this repository, `kassis-addon` is `tools/adk/kassis-addon.mjs`. `npm run create-addon` forwards to `init`.

Outside the repository, install `@kassis/addon-cli` and run `npx kassis-addon`. That package does not contain the private signing key. `sign` without `--key` exits 1 there.

## Air-gapped bundle

```bash
node tools/adk/airgap-bundle.mjs --out=./airgap
```

The bundle contains the SDK, the testkit, the CLI, the template, the public verification key, and `sbom.json`. It refuses to include the private signing key.
