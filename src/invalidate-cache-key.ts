import { cacheStore } from "./cache-store";

const invalidationObservers = new Map<string, Set<() => void>>();

export function registerQueryParticipant(
  cacheKey: string,
  onInvalidate: () => void
): () => void {
  cacheStore.registerConsumer(cacheKey);

  let observers = invalidationObservers.get(cacheKey);
  if (!observers) {
    observers = new Set();
    invalidationObservers.set(cacheKey, observers);
  }
  observers.add(onInvalidate);

  return () => {
    const set = invalidationObservers.get(cacheKey);
    if (set) {
      set.delete(onInvalidate);
      if (set.size === 0) {
        invalidationObservers.delete(cacheKey);
      }
    }
    cacheStore.releaseConsumer(cacheKey);
  };
}

export function invalidateCacheKey(cacheKey: string): void {
  const entry = cacheStore.get(cacheKey);
  if (entry) {
    entry.abortController?.abort();
    cacheStore.set(cacheKey, {
      data: entry.data,
      timestamp: 0,
      ttl: entry.ttl,
      inFlight: undefined,
      abortController: undefined,
    });
  }

  const observers = invalidationObservers.get(cacheKey);
  if (!observers) {
    return;
  }

  for (const observer of [...observers]) {
    try {
      observer();
    } catch {
      // One observer must not block siblings.
    }
  }
}
