# kassis-adk

The Kassis Addon Development Kit. It lets client teams (and their coding agents) build, sign and deploy add-ons on top of Kassis without access to platform source code.

Published as the npm package `@kassis-ai/adk` on GitHub Packages.

## Status

This repo is the new home for the ADK, which currently lives inside the main platform repo. The code is moved here in a separate step; until then this is the agreed structure.

## Layout

```
src/            ADK library: addon manifest types, SDK clients, signing
cli/            command line tool: scaffold, validate, sign, package
docs/           developer guide for addon authors
examples/       minimal example addons
```

## Releasing

1. Update `CHANGELOG.md`.
2. Bump `version` in `package.json`.
3. Tag `vX.Y.Z` and push the tag. The release workflow publishes the package.

## Compatibility

Each ADK release states which Kassis platform versions it supports. Breaking changes to the addon contract only happen in a major release.
