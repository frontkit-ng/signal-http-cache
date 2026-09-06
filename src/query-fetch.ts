import { WritableSignal } from "@angular/core";
import { cacheStore } from "./cache-store";
import { HttpQueryError, QueryFetchInit, QueryKey } from "./types";
import { parseJsonSafe, toHttpQueryError } from "./utils";

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
};

export type CreateQueryFetchOptions<T> = {
  data: WritableSignal<T | null>;
  loading: WritableSignal<boolean>;
  error: WritableSignal<HttpQueryError | null>;
  getActiveKey: () => { cacheKey: string; url: string };
  canUpdateLocal: (requestCacheKey: string) => boolean;
  ttl: number;
  staleWhileRevalidate: boolean;
  fetchInit: QueryFetchInit;
  fetchFn: typeof fetch;
};

export function createQueryFetchHandlers<T>(
  options: CreateQueryFetchOptions<T>
): QueryFetchHandlers<T> {
  const {
    data,
    loading,
    error,
    getActiveKey,
    canUpdateLocal,
    ttl,
    staleWhileRevalidate,
    fetchInit,
    fetchFn,
  } = options;

  function updateLocal(
    requestCacheKey: string,
    update: () => void
  ): void {
    if (canUpdateLocal(requestCacheKey)) {
      update();
    }
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
      timestamp: current.timestamp,
      ttl: current.ttl,
      inFlight: undefined,
      abortController: undefined,
    });
  }

  async function revalidate(): Promise<void> {
    const { cacheKey, url } = getActiveKey();
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
      timestamp: previous?.timestamp ?? 0,
      ttl: ttl,
      inFlight: inFlightPromise,
      abortController,
    });

    try {
      const response = await fetchFn(url, {
        ...fetchInit,
        method: "GET",
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw {
          message: `HTTP ${response.status}`,
          status: response.status,
          statusText: response.statusText,
        };
      }

      const json = parseJsonSafe<T>(await response.text());
      const current = cacheStore.get<T>(cacheKey);

      if (current?.inFlight === inFlightPromise) {
        cacheStore.set(cacheKey, {
          data: json,
          timestamp: Date.now(),
          ttl: ttl,
          inFlight: undefined,
          abortController: undefined,
        });
        settleInFlight("resolve", json);
        updateLocal(requestCacheKey, () => data.set(json));
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
        try {
          const result = await cached.inFlight;
          updateLocal(requestCacheKey, () => {
            error.set(null);
            data.set(result);
          });
        } catch (e) {
          if (isAbortError(e)) {
            return;
          }
          updateLocal(requestCacheKey, () => error.set(toHttpQueryError(e)));
        }
        return;
      }
    }

    if (cached && !force) {
      const expired = Date.now() - cached.timestamp > ttl;

      if (!expired) {
        updateLocal(requestCacheKey, () => {
          error.set(null);
          data.set(cached.data);
        });
        return;
      }
      if (staleWhileRevalidate) {
        updateLocal(requestCacheKey, () => {
          error.set(null);
          data.set(cached.data);
        });
        void revalidate();
        return;
      }
    }

    return revalidate();
  }

  function invalidate(): void {
    const { cacheKey } = getActiveKey();
    const entry = cacheStore.get<T>(cacheKey);
    if (entry) {
      entry.abortController?.abort();
      entry.timestamp = 0;
    }
  }

  return { fetchData, invalidate };
}
