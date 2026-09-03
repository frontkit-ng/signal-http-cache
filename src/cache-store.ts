export interface CacheEntry<T> {
  data: T | null;
  timestamp: number;
  ttl: number;
  inFlight?: Promise<T>;
  abortController?: AbortController;
  refCount: number;
}

const cache = new Map<string, CacheEntry<any>>();
const consumerCounts = new Map<string, number>();

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
    consumerCounts.clear();
  },
  registerConsumer(key: string): void {
    consumerCounts.set(key, (consumerCounts.get(key) ?? 0) + 1);
  },
  releaseConsumer(key: string): boolean {
    const count = (consumerCounts.get(key) ?? 0) - 1;
    if (count <= 0) {
      consumerCounts.delete(key);
      this.delete(key);
      return true;
    }
    consumerCounts.set(key, count);
    const entry = cache.get(key);
    if (entry) {
      entry.refCount = count;
    }
    return false;
  },
  getConsumerCount(key: string): number {
    return consumerCounts.get(key) ?? 0;
  },
  size(): number {
    return cache.size;
  },
};
