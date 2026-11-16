---
name: adk.add-route
description: >-
  Add an HTTP route to a Kassis addon with kassis-addon scaffold route.
  Use when the BRD needs a new GET endpoint, a permission in the addon
  namespace, and mount wiring from initialize.
---

# Add a route

## When to use

A Must requirement needs a new HTTP surface on this addon. Prefer a host facade or UI contribution when they already cover the need. Use a route when the addon must expose its own API under `/api/v1/addons/<id>/…`.

## Steps

1. From the addon root: `kassis-addon scaffold --kind=route --name=<kebab-case>`.
2. Confirm `manifest.json` gained `<addon-id>.<name>` under `permissions`.
3. Edit `src/server/routes/<name>.ts` — keep the Express GET stub working, then add the real handler. Every write goes through `ctx.data` or a host facade and records a declared audit action.
4. Confirm `src/server/index.ts` calls `mount<Name>(ctx)` from `initialize`.
5. Add or extend a test under `test/` that names the requirement id (`FR-*` / `NFR-*`).
6. Run `kassis-addon check`, then `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Import host services by name or reach outside `@kassis/*` and this addon's `src/`.
- Skip the permission declaration or mount a route outside the addon namespace.
- Hand-write a parallel router when scaffold already wired the mount.
