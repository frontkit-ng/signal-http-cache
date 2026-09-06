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
 * `Signal<QueryKey>`. Automatically fetches when a new serialized key becomes
 * active (synchronously on construction, then via effect-scheduled transitions).
 *
 * Must be called synchronously within an Angular injection context.
 */
export function createReactiveQuery<T>(
  key: Signal<QueryKey>,
  options: Omit<QueryOptions, "method"> = {},
  fetchFn: typeof fetch = fetch
): HttpQuery<T> {
  const { library, fetchInit } = splitQueryOptions(options);
  const { ttl, staleWhileRevalidate } = library;
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<HttpQueryError | null>(null);

  const destroyRef = inject(DestroyRef);

  let activeCacheKey = "";
  let activeUrl = "";

  const getActiveKey = () => ({ cacheKey: activeCacheKey, url: activeUrl });
  const canUpdateLocal = (requestCacheKey: string) =>
    requestCacheKey === activeCacheKey;

  const { fetchData, invalidate } = createQueryFetchHandlers<T>({
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

  function activateKey(keyValue: QueryKey): void {
    const next = resolveQueryKey(keyValue);
    if (next.cacheKey === activeCacheKey) {
      return;
    }

    if (activeCacheKey) {
      cacheStore.releaseConsumer(activeCacheKey);
    }

    activeCacheKey = next.cacheKey;
    activeUrl = next.url;
    cacheStore.registerConsumer(activeCacheKey);

    error.set(null);
    hydrateFromCache(activeCacheKey);

    void fetchData(false);
  }

  destroyRef.onDestroy(() => {
    if (activeCacheKey) {
      cacheStore.releaseConsumer(activeCacheKey);
    }
  });

  activateKey(key());

  effect(() => {
    const observedKey = key();
    untracked(() => activateKey(observedKey));
  });

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    fetch: fetchData,
    invalidate,
  };
}
