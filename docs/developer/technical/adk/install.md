# Install

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

## Prerequisites

- Node.js 24 (the server image is `node:24.18.1`). The CLI itself runs on the Node that ships with the repo.
- Docker, when you want the local stack. Rebuild with `cmd /c "rebuild.bat -fb < nul"` from the repo root. Do not use `docker compose build` in place of that script.

## Packages

The public packages are `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/addon-ui`, `@kassis/host-sdk`, `@kassis/agent-kit`, and `@kassis/addon-cli`. They publish to GitHub Packages (`publishConfig.registry` is `https://npm.pkg.github.com`). Copy `.npmrc.example` to `.npmrc` and set `NODE_AUTH_TOKEN` in the environment. Do not commit a token.

Each package builds to `dist`. `@kassis/addon-sdk`, `@kassis/addon-testkit`, `@kassis/agent-kit`, and `@kassis/addon-cli` publish JavaScript. `@kassis/host-sdk` and `@kassis/addon-ui` publish type declarations plus a small JavaScript shim so plain Node can import the package. The shim does not contain the host UI. The running host serves `@kassis/host-sdk` at `/host-sdk/index.js` and `@kassis/addon-ui` at `/host-sdk/addon-ui.js`. An addon frontend build leaves those imports external.

Inside this repository, each public package's `exports` point at TypeScript source so the server can load them without a package build. `prepack` copies the `dist` entry points onto the tarball and `postpack` restores the workspace file. The published `publishConfig` keeps `registry`, `access`, and `provenance`.

```bash
npm install @kassis/addon-sdk @kassis/addon-testkit @kassis/addon-ui @kassis/host-sdk @kassis/agent-kit @kassis/addon-cli
```

Offline, run `npm run build` in each package, then pack the tarballs and install them elsewhere. `@kassis/addon-cli` `prepack` bundles `kassis-addon` and `kassis-adk-mcp` so the tarball does not import the repository. It also copies the template, the manifest schema, profiles, and the public verification key:

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

Outside the repository, install `@kassis/addon-cli` and run `npx kassis-addon`. `--version` reads that package's own `package.json`. The MCP server is `npx kassis-adk-mcp`. The package does not contain the private signing key. `sign` without `--key` exits 1 there.

## Clean-room check

```bash
node scripts/adk-clean-room.mjs
```

The script builds the six public packages, packs them, and installs those tarballs in an empty folder with `npm install --no-package-lock`. `prepack` writes the `dist` entry points into the tarball npm publishes. Plain Node then loads `dist`. It imports each runtime entry with plain Node. It then runs `kassis-addon init`, scaffolds every scaffold kind including tier 2 `capability`, reinstalls dependencies (including a packed `@kassis/mcp-contract` tarball), then `build`, `test`, `check`, `conformance`, and `package` on a tier 2 rung 3 addon with `signature` and `contentHash`. `@kassis/adk-core` stays private and is not packed. The script does not deploy to an instance and does not approve a request.

## Air-gapped bundle

```bash
node tools/adk/airgap-bundle.mjs --out=./airgap
node scripts/adk-clean-room.mjs --airgap --bundle=./airgap
```

The bundle contains the SDK, the testkit, the template, the public verification key, `sbom.json`, the six public package tarballs, `packages/adk-core` sources, the CLI entry `tools/adk/kassis-addon.mjs`, and `checksums.txt`. It refuses to include the private signing key. There is no separate CLI binary.

`--airgap` runs only when that directory is already populated. It checks `checksums.txt`, installs with `file:` tarballs from the bundle, and refuses the npm registry. Deploy, approval, and a live health check are not part of this command.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-16 | Clean room scaffolds route, event, job, migration, ui-slot, ui-page, mcp-tool, and tier 2 capability after init, and packs `@kassis/mcp-contract` for offline MCP tests.                                                                                                |
| 2026-10-30 | The `.npmrc.example` path is text. The docs site does not publish files outside `docs/`.                                                                                                                                                                                             |
| 2026-10-28 | `prepack` puts `dist` entry points in each public tarball. The workspace `exports` stay on source so the server image still loads them.                                                                                                                                              |
| 2026-10-28 | The packed `@kassis/addon-cli` bundles the CLI and the MCP server. An install outside the repository runs `init`, `check`, and `kassis-adk-mcp` without the checkout.                                                                                                                |
| 2026-10-28 | `node scripts/adk-clean-room.mjs` packs the six public packages, installs the tarballs, imports them, and runs init, build, test, check, conformance, and package for a tier 2 rung 2 addon. The air-gap bundle adds those tarballs, adk-core sources, the CLI entry, and checksums. |
| 2026-10-28 | The six public packages build to `dist` and publish to GitHub Packages. `host-sdk` and `addon-ui` publish types and a Node shim. The host still serves the runtime.                                                                                                                  |
