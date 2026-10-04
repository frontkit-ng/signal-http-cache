import { cacheStore } from "./cache-store";

const invalidationObservers = new Map<string, Set<() => void>>();

export function registerQueryParticipant(
  cacheKey: string,
  onInvalidate: () => void,
  retentionTimeMs: number
): () => void {
  cacheStore.registerConsumer(cacheKey, retentionTimeMs);

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
      hasResolvedData: entry.hasResolvedData,
      timestamp: 0,
      ttl: entry.ttl,
      inFlight: undefined,
      abortController: undefined,
      idleTimer: entry.idleTimer,
      idleGeneration: entry.idleGeneration,
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
