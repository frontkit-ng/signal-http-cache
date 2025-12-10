import { signal, DestroyRef, inject } from "@angular/core";
import { cacheStore } from "./cache-store";
import { HttpQuery, HttpQueryError, QueryKey, QueryOptions } from "./types";
import { parseJsonSafe, toHttpQueryError } from "./utils";

function resolveQueryKey(key: QueryKey): { cacheKey: string; url: string } {
  if (typeof key === "string") {
    return { cacheKey: key, url: key };
  }

  const [url] = key;
  const cacheKey = JSON.stringify(key);
  return { cacheKey, url };
}

export function createQuery<T>(
  key: QueryKey,
  options: Omit<QueryOptions, "method"> = {},
  fetchFn: typeof fetch = fetch
): HttpQuery<T> {
  const { cacheKey, url } = resolveQueryKey(key);
  const ttl = options.ttl ?? 0;
  const data = signal<T | null>(null);
  const loading = signal(false);
  const error = signal<HttpQueryError | null>(null);
  const existing = cacheStore.get<T>(cacheKey);

  if (existing) {
    cacheStore.incrementRef(cacheKey);
    // hydrate signal with existing cached data
    if (existing.data !== null) {
      data.set(existing.data);
    }
  }

  // auto cleanup on destroy
  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => {
    cacheStore.decrementRef(cacheKey);
  });

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
      if (options.staleWhileRevalidate) {
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

    const inFlightPromise = new Promise<T>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const previous = cacheStore.get<T>(cacheKey);

    cacheStore.set(cacheKey, {
      data: previous?.data ?? null,
      timestamp: previous?.timestamp ?? 0,
      ttl: ttl,
      inFlight: inFlightPromise,
      abortController,
      refCount: previous?.refCount ?? 1,
    });

    try {
      const response = await fetchFn(url, {
        ...options,
        method: "GET",
        headers: options.headers,
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

      cacheStore.set(cacheKey, {
        data: json,
        timestamp: Date.now(),
        ttl: ttl,
        inFlight: undefined,
        abortController: undefined,
        refCount: cacheStore.get<T>(cacheKey)?.refCount ?? 1,
      });

      resolveFn(json);
      data.set(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      rejectFn(e);
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
