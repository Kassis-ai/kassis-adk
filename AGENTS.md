# AGENTS.md

Rules for agents working in kassis-adk.

- The kit never imports Kassis host code. `npm run ci:packages:addon-sdk-boundary` fails on
  any import outside a kit package.
- Keep files under 300 lines (Code Complete: one reason to change, readable in one go).
  Split into focused modules instead of growing a file.
- The publisher trust seed (`packages/adk-core/trust/publisher-trust.json`) and the
  verification key (`packages/adk-core/keys/addon_verification_public.key`) are copies of
  the host's files. Change them only together with the host.
- Never commit a private key, token or `.env` file.
- Client docs live in `docs/developer/technical/adk`. After editing one, run
  `node tools/adk/sync-client-docs.mjs` so the CLI copy matches.
- Before a push, run `npm run gate`.
- Versions move as one changesets fixed group. Add a changeset for every public change.
