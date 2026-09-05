# Angular consumer compatibility harness

This folder proves that a real Angular application can install, typecheck, and build against the **packaged tarball** produced by `npm pack` from the repository root.

## Run locally

```bash
# All supported majors (16 through current stable)
npm run test:compat

# Single major
node compat/scripts/run-compat.mjs --major 16
```

Generated workspaces land in `compat/.workspaces/` (gitignored).

## What is tested

- `npm pack` artifact installation (not source imports)
- Public API usage: `createQuery`, `createMutation`, injection-context field initializer, Signal return types, query options
- `tsc -p tsconfig.app.json --noEmit`
- `ng build consumer`

Runtime browser execution is not part of this harness; package behavior is covered by the main Vitest suite.

## Toolchain mapping

See [`matrix.json`](./matrix.json). Node and TypeScript versions follow [angular.dev/reference/versions](https://angular.dev/reference/versions) for each Angular major.

Angular 22 requires Node `^22.22.3` (or newer supported LTS). Local runs on older Node 22.x may fail at the CLI step even when install/typecheck succeed.
