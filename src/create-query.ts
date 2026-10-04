import { computed, signal, DestroyRef, inject } from "@angular/core";
import { cacheStore } from "./cache-store";
import { registerQueryParticipant } from "./invalidate-cache-key";
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
  const isFetching = signal(false);
  const hasResolvedData = signal(false);
  const isLoading = computed(() => isFetching() && !hasResolvedData());
  const error = signal<HttpQueryError | null>(null);

  const destroyRef = inject(DestroyRef);

  let revalidationEligible = false;

  const { fetchData, invalidate } = createQueryFetchHandlers<T>({
    data,
    loading,
    isFetching,
    hasResolvedData,
    error,
    getActiveKey: () => ({ cacheKey, url }),
    canUpdateLocal: () => true,
    ttl,
    staleWhileRevalidate,
    fetchInit,
    fetchFn,
  });

  const releaseParticipant = registerQueryParticipant(cacheKey, () => {
    if (revalidationEligible) {
      void fetchData(false);
    }
  });

  destroyRef.onDestroy(() => {
    releaseParticipant();
  });

  const existing = cacheStore.get<T>(cacheKey);
  if (existing?.data !== null && existing?.data !== undefined) {
    data.set(existing.data);
    hasResolvedData.set(true);
  }

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    isLoading,
    isFetching: isFetching.asReadonly(),
    error: error.asReadonly(),
    fetch: (force?) => {
      revalidationEligible = true;
      return fetchData(force);
    },
    invalidate,
  };
}
