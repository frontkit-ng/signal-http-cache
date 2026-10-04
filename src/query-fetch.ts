import { WritableSignal } from "@angular/core";
import { cacheStore } from "./cache-store";
import { invalidateCacheKey } from "./invalidate-cache-key";
import { runQueryLoader } from "./query-loader";
import type { QueryHttpExecutor } from "./internal/http-transport-types";
import {
  HttpQueryError,
  QueryFetchInit,
  QueryKey,
  QueryLoader,
} from "./types";
import {
  parseJsonSafe,
  toHttpQueryError,
  transportFailureToHttpQueryError,
} from "./utils";

export function isCacheEntryExpired(timestamp: number, ttl: number): boolean {
  return timestamp === 0 || Date.now() - timestamp > ttl;
}

export function resolveQueryKey(key: QueryKey): { cacheKey: string; url: string } {
  if (typeof key === "string") {
    return { cacheKey: key, url: key };
  }

  const [url] = key;
  const cacheKey = JSON.stringify(key);
  return { cacheKey, url };
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export type QueryFetchHandlers<T> = {
  fetchData(force?: boolean): Promise<void>;
  invalidate(): void;
  resetParticipation(): void;
};

export type CreateQueryFetchOptions<T> = {
  data: WritableSignal<T | null>;
  loading: WritableSignal<boolean>;
  isFetching: WritableSignal<boolean>;
  hasResolvedData: WritableSignal<boolean>;
  error: WritableSignal<HttpQueryError | null>;
  getActiveKey: () => { cacheKey: string; url: string; queryKey: QueryKey };
  canUpdateLocal: (requestCacheKey: string) => boolean;
  ttl: number;
  staleWhileRevalidate: boolean;
  fetchInit: QueryFetchInit;
  queryExecutor: QueryHttpExecutor;
  loader?: QueryLoader<T>;
};

export function createQueryFetchHandlers<T>(
  options: CreateQueryFetchOptions<T>
): QueryFetchHandlers<T> {
  const {
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
  } = options;

  let activeParticipation: Promise<T> | null = null;

  function updateLocal(
    requestCacheKey: string,
    update: () => void
  ): void {
    if (canUpdateLocal(requestCacheKey)) {
      update();
    }
  }

  function beginParticipation(
    requestCacheKey: string,
    promise: Promise<T>
  ): void {
    activeParticipation = promise;
    updateLocal(requestCacheKey, () => isFetching.set(true));
  }

  function endParticipation(
    requestCacheKey: string,
    promise: Promise<T>
  ): void {
    if (activeParticipation !== promise) {
      return;
    }
    activeParticipation = null;
    updateLocal(requestCacheKey, () => isFetching.set(false));
  }

  function resetParticipation(): void {
    activeParticipation = null;
    isFetching.set(false);
  }

  function clearActiveRequestIfCurrent(
    cacheKey: string,
    inFlightPromise: Promise<T>
  ): void {
    const current = cacheStore.get<T>(cacheKey);
    if (current?.inFlight !== inFlightPromise) {
      return;
    }

    cacheStore.set(cacheKey, {
      data: current.data,
      hasResolvedData: current.hasResolvedData,
      timestamp: current.timestamp,
      ttl: current.ttl,
      inFlight: undefined,
      abortController: undefined,
    });
  }

  async function executeRequest(
    abortSignal: AbortSignal
  ): Promise<T> {
    const { url, queryKey } = getActiveKey();

    if (loader) {
      return runQueryLoader(loader, { key: queryKey, abortSignal });
    }

    const result = await queryExecutor({
      url,
      init: fetchInit,
      signal: abortSignal,
    });

    if (!result.ok) {
      const failure = transportFailureToHttpQueryError(result);
      throw failure;
    }

    return parseJsonSafe<T>(result.bodyText);
  }

  async function revalidate(): Promise<void> {
    const { cacheKey } = getActiveKey();
    const requestCacheKey = cacheKey;
    const abortController = new AbortController();

    updateLocal(requestCacheKey, () => {
      loading.set(true);
      error.set(null);
    });

    let resolveFn!: (value: T) => void;
    let rejectFn!: (error: unknown) => void;
    let settled = false;

    const inFlightPromise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    inFlightPromise.catch(() => {
      // Avoid unhandled rejection when this attempt has no joiners.
    });

    beginParticipation(requestCacheKey, inFlightPromise);

    const settleInFlight = (
      outcome: "resolve" | "reject",
      value?: T,
      reason?: unknown
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (outcome === "resolve") {
        resolveFn(value as T);
      } else {
        rejectFn(reason);
      }
    };

    const previous = cacheStore.get<T>(cacheKey);

    cacheStore.set(cacheKey, {
      data: previous?.data ?? null,
      hasResolvedData: previous?.hasResolvedData ?? false,
      timestamp: previous?.timestamp ?? 0,
      ttl: ttl,
      inFlight: inFlightPromise,
      abortController,
    });

    try {
      const json = await executeRequest(abortController.signal);
      const current = cacheStore.get<T>(cacheKey);

      if (current?.inFlight === inFlightPromise) {
        cacheStore.set(cacheKey, {
          data: json,
          hasResolvedData: true,
          timestamp: Date.now(),
          ttl: ttl,
          inFlight: undefined,
          abortController: undefined,
        });
        settleInFlight("resolve", json);
        updateLocal(requestCacheKey, () => {
          data.set(json);
          hasResolvedData.set(true);
        });
      } else {
        settleInFlight(
          "reject",
          undefined,
          new DOMException("Aborted", "AbortError")
        );
      }
    } catch (e) {
      if (isAbortError(e)) {
        clearActiveRequestIfCurrent(cacheKey, inFlightPromise);
        settleInFlight(
          "reject",
          undefined,
          new DOMException("Aborted", "AbortError")
        );
        return;
      }

      clearActiveRequestIfCurrent(cacheKey, inFlightPromise);
      settleInFlight("reject", undefined, e);
      updateLocal(requestCacheKey, () => error.set(toHttpQueryError(e)));
    } finally {
      updateLocal(requestCacheKey, () => loading.set(false));
      endParticipation(requestCacheKey, inFlightPromise);
    }
  }

  async function fetchData(force = false): Promise<void> {
    const { cacheKey } = getActiveKey();
    const requestCacheKey = cacheKey;
    const cached = cacheStore.get<T>(cacheKey);

    if (cached?.inFlight) {
      if (force) {
        cached.abortController?.abort();
      } else {
        const joined = cached.inFlight;
        beginParticipation(requestCacheKey, joined);
        try {
          const result = await joined;
          updateLocal(requestCacheKey, () => {
            error.set(null);
            data.set(result);
            hasResolvedData.set(true);
          });
        } catch (e) {
          if (isAbortError(e)) {
            return;
          }
          updateLocal(requestCacheKey, () => error.set(toHttpQueryError(e)));
        } finally {
          endParticipation(requestCacheKey, joined);
        }
        return;
      }
    }

    if (cached && !force) {
      const expired = isCacheEntryExpired(cached.timestamp, ttl);

      if (!expired) {
        updateLocal(requestCacheKey, () => {
          error.set(null);
          data.set(cached.data);
          hasResolvedData.set(true);
        });
        return;
      }
      if (staleWhileRevalidate) {
        updateLocal(requestCacheKey, () => {
          error.set(null);
          data.set(cached.data);
          hasResolvedData.set(true);
        });
        void revalidate();
        return;
      }
    }

    return revalidate();
  }

  function invalidate(): void {
    const { cacheKey } = getActiveKey();
    invalidateCacheKey(cacheKey);
  }

  return { fetchData, invalidate, resetParticipation };
}
