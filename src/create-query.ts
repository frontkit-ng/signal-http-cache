import { signal, DestroyRef, inject } from "@angular/core";
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
 * Creates a signal-backed HTTP query with shared cache and lifecycle cleanup.
 *
 * Must be called synchronously within an Angular injection context (for example,
 * a component or service field initializer) so `DestroyRef` can register cleanup.
 */
export function createQuery<T>(
  key: QueryKey,
  options: Omit<QueryOptions, "method"> = {},
  fetchFn: typeof fetch = fetch
): HttpQuery<T> {
  const { cacheKey, url } = resolveQueryKey(key);
  const { library, fetchInit } = splitQueryOptions(options);
  const { ttl, staleWhileRevalidate } = library;
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<HttpQueryError | null>(null);

  const destroyRef = inject(DestroyRef);

  cacheStore.registerConsumer(cacheKey);

  destroyRef.onDestroy(() => {
    cacheStore.releaseConsumer(cacheKey);
  });

  const existing = cacheStore.get<T>(cacheKey);
  if (existing?.data !== null && existing?.data !== undefined) {
    data.set(existing.data);
  }

  const { fetchData, invalidate } = createQueryFetchHandlers<T>({
    data,
    loading,
    error,
    getActiveKey: () => ({ cacheKey, url }),
    canUpdateLocal: () => true,
    ttl,
    staleWhileRevalidate,
    fetchInit,
    fetchFn,
  });

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    fetch: fetchData,
    invalidate,
  };
}
