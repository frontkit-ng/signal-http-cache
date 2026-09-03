# Changelog

All notable changes to this project will be documented in this file.

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