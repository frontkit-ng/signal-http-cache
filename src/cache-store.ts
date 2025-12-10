export interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
  ttl: number;
  inFlight?: Promise<T>;
  abortController?: AbortController;
  refCount: number;
}

const cache = new Map<string, CacheEntry<any>>();

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
    cache.set(key, entry);
  },
  delete(key: string) {
    const entry = cache.get(key);
    entry?.abortController?.abort();
    cache.delete(key);
  },
  clear() {
    for (const [, entry] of cache.entries()) {
      entry.abortController?.abort();
    }
    cache.clear();
  },
  incrementRef(key: string) {
    const entry = cache.get(key);
    if (entry) {
      entry.refCount++;
    }
  },
  decrementRef(key: string): boolean {
    const entry = cache.get(key);
    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        this.delete(key);
        return true;
      }
    }
    return false;
  },
  size(): number {
    return cache.size;
  },
};
