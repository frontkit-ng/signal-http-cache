# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.3.0] - 2026-09-05

### Added

- Angular 16–22 compatibility validated through consumer install, typecheck, and build checks against the packed npm artifact (CI matrix).
- Permanent behavioral test suite for cache, concurrency, lifecycle, stale-while-revalidate, invalidation, and mutations.
- Semantic TypeScript checking for tests via `npm run test:typecheck`.
- GitHub Actions CI and Angular 16–22 consumer compatibility workflow.

### Changed

- **Breaking:** Removed `cacheStore` and `CacheEntry` from the public package API. Cache behavior is accessed through `createQuery()` and mutation APIs only.
- **Breaking:** Package `exports` now exposes only the root entry point (`@frontkit-ng/signal-http-cache`). Unsupported deep imports into internal `dist/` modules are no longer resolvable under standards-compliant package resolution.
- Peer dependency range tightened to `@angular/core >=16.0.0 <23.0.0` for tested Angular majors 16–22.
- Added `sideEffects: false` for bundler tree-shaking; published modules perform no externally meaningful import-time behavior such as registration, provider setup, or global mutation.

### Fixed

- Failed or aborted requests no longer permanently block query recovery; later `fetch()` calls can retry normally.
- `fetch(true)` safely supersedes in-flight work without allowing a stale request to overwrite a newer force refresh.
- Multiple live `createQuery()` consumers of the same key now share lifecycle ownership correctly.
- Library-owned query options (`ttl`, `staleWhileRevalidate`) are no longer forwarded to custom `fetchFn` transport `RequestInit`.

### Removed

- Internal `CacheEntry.refCount` duplicate ownership field; active-consumer ownership uses `consumerCounts` only.
- Unused `tslib` runtime dependency.

### Documentation

- Documented browser/client-side cache boundary; Angular SSR/server cache isolation is not currently supported.
- Documented static query-key semantics and Angular injection-context requirements for `createQuery()`.
- Clarified positioning relative to Angular native `resource()` / `httpResource()` APIs.

## [0.2.3] - 2026-03-03

### Fixed

- Failed or aborted requests no longer permanently block query recovery; later `fetch()` calls can retry normally.
- `fetch(true)` safely supersedes in-flight work without allowing a stale request to overwrite a newer force refresh.
- Multiple live `createQuery()` consumers of the same key now share lifecycle ownership correctly, including consumers created before the first fetch.
- HttpClient integration example and Angular injection-context requirements are documented accurately.

### Added

- Permanent behavioral test suite for cache, concurrency, lifecycle, stale-while-revalidate, invalidation, and mutations.
- Semantic TypeScript checking for tests via `npm run test:typecheck`.
- GitHub Actions CI validation workflow.

## [0.1.8] - 2025-12-10
- Adding Mutants to support PUSH/PUT/PATCH/DELETE actions

## [0.1.6] - 2025-12-03
- Various improvements and bug fixes

### Removed
- Unused `rxjs` dependency

## [0.1.5] - 2025-12-03
### Added
- Improved cleanup behavior.

## [0.1.4] - 2025-12-02
### Added
- Added queryKey support.
