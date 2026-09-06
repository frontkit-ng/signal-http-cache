import {
  signal,
  DestroyRef,
  inject,
  effect,
  untracked,
  Signal,
} from "@angular/core";
import { cacheStore } from "./cache-store";
import { createQueryFetchHandlers, resolveQueryKey } from "./query-fetch";
import {
  HttpQuery,
  HttpQueryError,
  QueryKey,
  QueryOptions,
  splitQueryOptions,
} from "./types";

/**
 * Creates a reactive signal-backed HTTP query whose cache identity follows a
 * `Signal<QueryKey | undefined>`. Automatically fetches when a new serialized
 * key becomes active (synchronously on construction, then via effect-scheduled
 * transitions). When the signal is `undefined`, the query is inactive — no cache
 * identity, no fetch.
 *
 * Must be called synchronously within an Angular injection context.
 */
export function createReactiveQuery<T>(
  key: Signal<QueryKey | undefined>,
  options: Omit<QueryOptions, "method"> = {},
  fetchFn: typeof fetch = fetch
): HttpQuery<T> {
  const { library, fetchInit } = splitQueryOptions(options);
  const { ttl, staleWhileRevalidate } = library;
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<HttpQueryError | null>(null);

  const destroyRef = inject(DestroyRef);

  let activeCacheKey: string | undefined;
  let activeUrl: string | undefined;

  const isActive = () => activeCacheKey !== undefined;

  const getActiveKey = () => ({
    cacheKey: activeCacheKey as string,
    url: activeUrl as string,
  });

  const canUpdateLocal = (requestCacheKey: string) =>
    activeCacheKey !== undefined && requestCacheKey === activeCacheKey;

  const { fetchData, invalidate: invalidateActiveKey } =
    createQueryFetchHandlers<T>({
      data,
      loading,
      error,
      getActiveKey,
      canUpdateLocal,
      ttl,
      staleWhileRevalidate,
      fetchInit,
      fetchFn,
    });

  function hydrateFromCache(cacheKey: string): void {
    const existing = cacheStore.get<T>(cacheKey);
    if (existing?.data !== null && existing?.data !== undefined) {
      data.set(existing.data);
    } else {
      data.set(null);
    }
  }

  function deactivate(): void {
    if (activeCacheKey !== undefined) {
      cacheStore.releaseConsumer(activeCacheKey);
    }
    activeCacheKey = undefined;
    activeUrl = undefined;
    error.set(null);
    data.set(null);
    loading.set(false);
  }

  function activateKey(keyValue: QueryKey): void {
    const next = resolveQueryKey(keyValue);
    if (next.cacheKey === activeCacheKey) {
      return;
    }

    if (activeCacheKey !== undefined) {
      cacheStore.releaseConsumer(activeCacheKey);
    }

    activeCacheKey = next.cacheKey;
    activeUrl = next.url;
    cacheStore.registerConsumer(activeCacheKey);

    error.set(null);
    hydrateFromCache(activeCacheKey);

    void fetchData(false);
  }

  function observeKey(next: QueryKey | undefined): void {
    if (next === undefined) {
      deactivate();
      return;
    }
    activateKey(next);
  }

  destroyRef.onDestroy(() => {
    if (activeCacheKey !== undefined) {
      cacheStore.releaseConsumer(activeCacheKey);
    }
  });

  observeKey(key());

  effect(() => {
    const observedKey = key();
    untracked(() => observeKey(observedKey));
  });

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    fetch: (force?) => (isActive() ? fetchData(force) : Promise.resolve()),
    invalidate: () => {
      if (!isActive()) {
        return;
      }
      invalidateActiveKey();
    },
  };
}
