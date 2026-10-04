export interface CacheEntry<T> {
  data: T | null;
  hasResolvedData: boolean;
  timestamp: number;
  ttl: number;
  inFlight?: Promise<T>;
  abortController?: AbortController;
  idleTimer?: ReturnType<typeof setTimeout>;
  idleGeneration?: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const consumerCounts = new Map<string, number>();
const liveEpochRetentionMs = new Map<string, number>();

function cancelIdleEviction(entry: CacheEntry<unknown>): void {
  if (entry.idleTimer !== undefined) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }
}

function abortAndClearInFlight(entry: CacheEntry<unknown>): void {
  entry.abortController?.abort();
  entry.inFlight = undefined;
  entry.abortController = undefined;
}

function scheduleIdleEviction(key: string, ms: number): void {
  const entry = cache.get(key);
  if (!entry) {
    return;
  }

  cancelIdleEviction(entry);
  const generation = (entry.idleGeneration ?? 0) + 1;
  entry.idleGeneration = generation;

  entry.idleTimer = setTimeout(() => {
    if ((consumerCounts.get(key) ?? 0) !== 0) {
      return;
    }
    const current = cache.get(key);
    if (!current || current.idleGeneration !== generation) {
      return;
    }
    cacheStore.delete(key);
  }, ms);
}

function removeEntry(key: string): void {
  const entry = cache.get(key);
  if (entry) {
    cancelIdleEviction(entry);
    entry.abortController?.abort();
  }
  cache.delete(key);
}

export const cacheStore = {
  get<T>(key: string) {
    return cache.get(key) as CacheEntry<T> | undefined;
  },
  has(key: string): boolean {
    return cache.has(key);
  },
  keys(): string[] {
    return Array.from(cache.keys());
  },
  set<T>(key: string, entry: CacheEntry<T>) {
    const previous = cache.get(key);
    if (previous?.idleTimer !== undefined && entry.idleTimer === undefined) {
      cancelIdleEviction(previous);
    }
    cache.set(key, entry as CacheEntry<unknown>);
  },
  delete(key: string) {
    removeEntry(key);
    liveEpochRetentionMs.delete(key);
  },
  clear() {
    for (const [, entry] of cache.entries()) {
      cancelIdleEviction(entry);
      entry.abortController?.abort();
    }
    cache.clear();
    consumerCounts.clear();
    liveEpochRetentionMs.clear();
  },
  registerConsumer(key: string, retentionTimeMs: number): void {
    const prevCount = consumerCounts.get(key) ?? 0;
    const nextCount = prevCount + 1;
    consumerCounts.set(key, nextCount);

    if (prevCount === 0) {
      liveEpochRetentionMs.set(key, retentionTimeMs);
      const entry = cache.get(key);
      if (entry) {
        cancelIdleEviction(entry);
        entry.idleGeneration = (entry.idleGeneration ?? 0) + 1;
      }
    } else {
      const epochMs = liveEpochRetentionMs.get(key) ?? retentionTimeMs;
      liveEpochRetentionMs.set(key, Math.max(epochMs, retentionTimeMs));
    }
  },
  releaseConsumer(key: string): boolean {
    const count = (consumerCounts.get(key) ?? 0) - 1;
    if (count > 0) {
      consumerCounts.set(key, count);
      return false;
    }

    consumerCounts.delete(key);
    const epochRetention = liveEpochRetentionMs.get(key) ?? 0;
    liveEpochRetentionMs.delete(key);

    const entry = cache.get(key);
    if (!entry || !entry.hasResolvedData) {
      removeEntry(key);
      return true;
    }

    abortAndClearInFlight(entry);

    if (epochRetention === 0) {
      removeEntry(key);
      return true;
    }

    scheduleIdleEviction(key, epochRetention);
    return true;
  },
  getConsumerCount(key: string): number {
    return consumerCounts.get(key) ?? 0;
  },
  size(): number {
    return cache.size;
  },
};
