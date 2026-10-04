import {
  signal,
  computed,
  DestroyRef,
  inject,
  effect,
  untracked,
  Signal,
} from "@angular/core";
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
      "createReactiveQuery: `loader` cannot be combined with a custom fetchFn argument."
    );
  }
}

function createReactiveQueryImpl<T>(
  key: Signal<QueryKey | undefined>,
  options: LoaderQueryOptions<T> | FetchQueryOptions = {},
  fetchFn?: typeof fetch
): HttpQuery<T> {
  const hasLoader = "loader" in options && typeof options.loader === "function";
  assertLoaderFetchFnExclusive(hasLoader ? options.loader : undefined, fetchFn);

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

  let activeCacheKey: string | undefined;
  let activeUrl: string | undefined;
  let activeQueryKey: QueryKey | undefined;
  let releaseParticipant: (() => void) | undefined;

  const isActive = () => activeCacheKey !== undefined;

  const getActiveKey = () => ({
    cacheKey: activeCacheKey as string,
    url: activeUrl as string,
    queryKey: activeQueryKey as QueryKey,
  });

  const canUpdateLocal = (requestCacheKey: string) =>
    activeCacheKey !== undefined && requestCacheKey === activeCacheKey;

  const { fetchData, invalidate: invalidateActiveKey, resetParticipation } =
    createQueryFetchHandlers<T>({
      data,
      loading,
      isFetching,
      hasResolvedData,
      error,
      getActiveKey,
      canUpdateLocal,
      ttl,
      staleWhileRevalidate,
      fetchInit,
      queryExecutor,
      loader,
    });

  function hydrateFromCache(cacheKey: string): void {
    const existing = cacheStore.get<T>(cacheKey);
    if (existing?.data !== null && existing?.data !== undefined) {
      data.set(existing.data);
      hasResolvedData.set(true);
    } else {
      data.set(null);
      hasResolvedData.set(false);
    }
  }

  function releaseActiveParticipant(): void {
    if (releaseParticipant) {
      releaseParticipant();
      releaseParticipant = undefined;
    }
  }

  function deactivate(): void {
    releaseActiveParticipant();
    resetParticipation();
    activeCacheKey = undefined;
    activeUrl = undefined;
    activeQueryKey = undefined;
    error.set(null);
    data.set(null);
    loading.set(false);
    hasResolvedData.set(false);
  }

  function activateKey(keyValue: QueryKey): void {
    const next = resolveQueryKey(keyValue);
    if (next.cacheKey === activeCacheKey) {
      return;
    }

    releaseActiveParticipant();
    resetParticipation();

    activeCacheKey = next.cacheKey;
    activeUrl = next.url;
    activeQueryKey = keyValue;
    releaseParticipant = registerQueryParticipant(activeCacheKey, () => {
      void fetchData(false);
    });

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
    releaseActiveParticipant();
  });

  observeKey(key());

  effect(() => {
    const observedKey = key();
    untracked(() => observeKey(observedKey));
  });

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    isLoading,
    isFetching: isFetching.asReadonly(),
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
  options: LoaderQueryOptions<T>
): HttpQuery<T>;
export function createReactiveQuery<T>(
  key: Signal<QueryKey | undefined>,
  options?: FetchQueryOptions
): HttpQuery<T>;
export function createReactiveQuery<T>(
  key: Signal<QueryKey | undefined>,
  options: FetchQueryOptions,
  fetchFn: typeof fetch
): HttpQuery<T>;
export function createReactiveQuery<T>(
  key: Signal<QueryKey | undefined>,
  options: LoaderQueryOptions<T> | FetchQueryOptions = {},
  fetchFn?: typeof fetch
): HttpQuery<T> {
  return createReactiveQueryImpl(key, options, fetchFn);
}
