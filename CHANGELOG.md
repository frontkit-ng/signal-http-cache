# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.5.0] - 2026-09-06

### Added

- `createReactiveQuery` accepts `Signal<QueryKey | undefined>`. When the key is `undefined`, the query is inactive — no active request, no transport, and no cache consumer ownership. A valid key later activates the query normally.
- Use this for nullable route or input IDs, optional selections, filters or forms that are not ready yet, and dependent reactive values.

### Fixed

- Reactive queries with an empty string key (`""`) are treated as a legitimate active `QueryKey` and no longer collide with inactive state.

### Documentation

- README: conditional reactive query examples, explicit `fetch(true)` after mutation `invalidateKeys` in the todos example, and TTL guidance for completed-response reuse.

### Compatibility

- Angular 16–22 remain supported and tested. Peer dependency unchanged: `@angular/core >=16.0.0 <23.0.0`.

## [0.4.0] - 2026-09-06

### Added

- `createReactiveQuery(keySignal, options?, fetchFn?)` for reactive/parameterized query identity driven by a `Signal<QueryKey>`.
- Automatic cache-aware fetch when a new serialized key becomes active — synchronously for the initial key, then on Angular effect-scheduled transitions. Intermediate coalesced signal writes may be skipped.
- Shared TTL, stale-while-revalidate, and in-flight deduplication for every active key; mutation and cache behavior remain shared with existing queries.

### Fixed

- Reactive query ownership migrates safely between active keys; late settlement from a previous key cannot overwrite the current key's visible state.
- `fetch()`, `fetch(true)`, and `invalidate()` always target the current active key at call time.

### Compatibility

- Angular 16–22 remain supported and tested. Peer dependency unchanged: `@angular/core >=16.0.0 <23.0.0`.

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
