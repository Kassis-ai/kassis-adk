# Changelog

All notable changes to the Kassis ADK. Format based on Keep a Changelog, versions follow semantic versioning.

## [Unreleased]

## [0.2.0] - 2026-11-23

The changesets fixed group moves together. Every public package is 0.2.0.

### Added

- `@kassis/addon-sdk` types for the host Tier 1 contract: `AddonContext.principal`, `AuditDetail.actor`, `AddonEvent.actorKind`, `RoutesFacade.serve` and `guards`, `CommunicationFacade.sendDirect`, the risk parity methods, `LlmFacade.completeDirect`, `invokeRegistered`, and `modelName`, `PromptsFacade.resolve` and `get`, `JobsFacade.host`, `LocksFacade.acquireExact` and `releaseExact`, and `AddonContext.rateLimit`, `sql`, and `widgets`, plus `DocumentsFacade.extractBuffer`, `extractFile`, and `mapAiTags`. Tier 1 only members say so in TSDoc. Tier 2 RPC refuses them.
- Tier-matrix rows for those methods (`tier2: false`).
- `@kassis/addon-testkit` fakes for the new context members. The testkit depends on TypeScript 5.9.3 for the compiler API the import and tier scans use. The repo still builds with TypeScript 7.

### Changed

- KADK-613 fix: pass `ctx.routes.principalOf` for a user row; pass `ctx.principal.service` with `actor: 'service'` for a system row.
- The acme-swift-approval expire audit sets `actor: 'service'`.
- Internal dependencies pin `0.2.0`. Repository stays `git+https://github.com/Kassis-ai/kassis-adk.git`.
- `@kassis/adk-core` names `@types/node` in its TypeScript config so `node:` imports typecheck on TypeScript 7.

## [0.1.1] - 2026-11-19

### Added
- `@kassis/adk-core/testing`: kit internals for the Kassis host contract tests (not addon API).

### Changed
- `conformanceIssues` moved into `@kassis/adk-core`.

## [0.1.0] - 2026-11-19

### Added
- First release on npmjs.com.

### Added
- Repository structure.
