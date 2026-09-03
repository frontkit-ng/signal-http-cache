import { signal, DestroyRef, inject } from "@angular/core";
import { cacheStore } from "./cache-store";
import {
  HttpQuery,
  HttpQueryError,
  QueryKey,
  QueryOptions,
  splitQueryOptions,
} from "./types";
import { parseJsonSafe, toHttpQueryError } from "./utils";

function resolveQueryKey(key: QueryKey): { cacheKey: string; url: string } {
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

  function clearActiveRequestIfCurrent(inFlightPromise: Promise<T>): void {
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

  async function fetchData(force = false): Promise<void> {
    const cached = cacheStore.get<T>(cacheKey);

    if (cached?.inFlight) {
      if (force) {
        cached.abortController?.abort();
      } else {
        try {
          const result = await cached.inFlight;
          error.set(null);
          data.set(result);
        } catch (e) {
          if (isAbortError(e)) {
            return;
          }
          error.set(toHttpQueryError(e));
        }
        return;
      }
    }

    if (cached && !force) {
      const expired = Date.now() - cached.timestamp > ttl;

      if (!expired) {
        error.set(null);
        data.set(cached.data);
        return;
      }
      if (staleWhileRevalidate) {
        error.set(null);
        data.set(cached.data);
        revalidate();
        return;
      }
    }

    return revalidate();
  }

  async function revalidate(): Promise<void> {
    const abortController = new AbortController();

    loading.set(true);
    error.set(null);

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
        data.set(json);
      } else {
        settleInFlight(
          "reject",
          undefined,
          new DOMException("Aborted", "AbortError")
        );
      }
    } catch (e) {
      if (isAbortError(e)) {
        clearActiveRequestIfCurrent(inFlightPromise);
        settleInFlight(
          "reject",
          undefined,
          new DOMException("Aborted", "AbortError")
        );
        return;
      }

      clearActiveRequestIfCurrent(inFlightPromise);
      settleInFlight("reject", undefined, e);
      error.set(toHttpQueryError(e));
    } finally {
      loading.set(false);
    }
  }

  function invalidate() {
    const entry = cacheStore.get<T>(cacheKey);
    if (entry) {
      entry.abortController?.abort();
      entry.timestamp = 0;
    }
  }

  return {
    data: data.asReadonly(),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    fetch: fetchData,
    invalidate,
  };
}
