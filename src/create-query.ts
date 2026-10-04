import { computed, signal, DestroyRef, inject } from "@angular/core";
import { cacheStore } from "./cache-store";
import { registerQueryParticipant } from "./invalidate-cache-key";
import { createFetchQueryExecutor } from "./internal/fetch-query-executor";
import { resolveQueryHttpExecutor } from "./internal/resolve-query-transport";
import { createQueryFetchHandlers, resolveQueryKey } from "./query-fetch";
import {
  splitLoaderQueryOptions,
  type FetchQueryOptions,
  type LoaderQueryOptions,
} from "./internal/loader-query-options";
import {
  HttpQuery,
  HttpQueryError,
  QueryKey,
  splitQueryOptions,
} from "./types";

function assertLoaderFetchFnExclusive(loader: unknown, fetchFn?: typeof fetch): void {
  if (loader && fetchFn !== undefined) {
    throw new Error(
      "createQuery: `loader` cannot be combined with a custom fetchFn argument."
    );
  }
}

function createQueryImpl<T>(
  key: QueryKey,
  options: LoaderQueryOptions<T> | FetchQueryOptions = {},
  fetchFn?: typeof fetch
): HttpQuery<T> {
  const hasLoader = "loader" in options && typeof options.loader === "function";
  assertLoaderFetchFnExclusive(hasLoader ? options.loader : undefined, fetchFn);

  const { cacheKey, url } = resolveQueryKey(key);
  const explicitFetchFn = fetchFn !== undefined;

  let ttl: number;
  let staleWhileRevalidate: boolean;
  let fetchInit: ReturnType<typeof splitQueryOptions>["fetchInit"];
  let loader: LoaderQueryOptions<T>["loader"] | undefined;

  if (hasLoader) {
    const split = splitLoaderQueryOptions(options as LoaderQueryOptions<T>);
    ttl = split.library.ttl;
    staleWhileRevalidate = split.library.staleWhileRevalidate;
    loader = split.loader;
    fetchInit = {};
  } else {
    const split = splitQueryOptions(options as FetchQueryOptions);
    ttl = split.library.ttl;
    staleWhileRevalidate = split.library.staleWhileRevalidate;
    fetchInit = split.fetchInit;
  }

  const queryExecutor = hasLoader
    ? createFetchQueryExecutor(fetch)
    : resolveQueryHttpExecutor({ explicitFetchFn, fetchFn });

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
    getActiveKey: () => ({ cacheKey, url, queryKey: key }),
    canUpdateLocal: () => true,
    ttl,
    staleWhileRevalidate,
    fetchInit,
    queryExecutor,
    loader,
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

/**
 * Creates a signal-backed HTTP query with shared cache and lifecycle cleanup.
 *
 * Must be called synchronously within an Angular injection context (for example,
 * a component or service field initializer) so `DestroyRef` can register cleanup.
 */
export function createQuery<T>(
  key: QueryKey,
  options: LoaderQueryOptions<T>
): HttpQuery<T>;
export function createQuery<T>(
  key: QueryKey,
  options?: FetchQueryOptions
): HttpQuery<T>;
export function createQuery<T>(
  key: QueryKey,
  options: FetchQueryOptions,
  fetchFn: typeof fetch
): HttpQuery<T>;
export function createQuery<T>(
  key: QueryKey,
  options: LoaderQueryOptions<T> | FetchQueryOptions = {},
  fetchFn?: typeof fetch
): HttpQuery<T> {
  return createQueryImpl(key, options, fetchFn);
}
