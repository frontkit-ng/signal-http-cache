import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import { invalidateCacheKey } from "./invalidate-cache-key";
import { MAX_RETENTION_MS } from "./internal/resolve-retention-time";
import {
  createQueryScope,
  createQueryScopes,
} from "./test-support/angular-context";
import {
  createDeferredFetch,
  flushMicrotasks,
} from "./test-support/fetch-mock";

describe("cache retention", () => {
  afterEach(() => {
    cacheStore.clear();
    vi.useRealTimers();
  });

  async function fetchResolved(
    scope: { query: { fetch(force?: boolean): Promise<void> } },
    deferred: ReturnType<typeof createDeferredFetch>,
    data: unknown
  ): Promise<void> {
    const promise = scope.query.fetch();
    await deferred.resolvePending(data);
    await promise;
    await flushMicrotasks();
  }

  it("retains settled entry after final consumer and evicts on timer", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/retain-default",
      fetchFn: deferred.fetchFn,
    });

    const fetchPromise = scope.query.fetch();
    await deferred.resolvePending("ok");
    await fetchPromise;
    scope.destroy();

    expect(cacheStore.getConsumerCount("/retain-default")).toBe(0);
    expect(cacheStore.has("/retain-default")).toBe(true);

    vi.advanceTimersByTime(59_999);
    expect(cacheStore.has("/retain-default")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cacheStore.has("/retain-default")).toBe(false);
  });

  it("retains and hydrates successful null", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<null>({
      key: "/null-retain",
      fetchFn: deferred.fetchFn,
    });

    await fetchResolved(scopeA, deferred, null);
    scopeA.destroy();
    expect(cacheStore.has("/null-retain")).toBe(true);

    const scopeB = createQueryScope<null>({
      key: "/null-retain",
      fetchFn: deferred.fetchFn,
    });
    expect(scopeB.query.data()).toBeNull();
    expect(scopeB.query.isLoading()).toBe(false);
    expect(deferred.callCount()).toBe(1);
    scopeB.destroy();
  });

  it("never-successful query does not retain a cache row", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/never-success",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });

    const inFlight = scope.query.fetch();
    scope.destroy();
    await deferred.rejectPending(new Error("fail"));
    await inFlight.catch(() => undefined);
    await flushMicrotasks();

    expect(cacheStore.has("/never-success")).toBe(false);
  });

  it("retentionTime 0 removes entry immediately on final release", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/retain-zero",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });

    await fetchResolved(scope, deferred, "x");
    scope.destroy();
    expect(cacheStore.has("/retain-zero")).toBe(false);
  });

  it("last consumer aborts in-flight without retaining inFlight state", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/abort-retain",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });

    const inFlight = scope.query.fetch();
    scope.destroy();
    await inFlight.catch(() => undefined);
    await flushMicrotasks();

    expect(deferred.getLastSignal()?.aborted).toBe(true);
    expect(cacheStore.has("/abort-retain")).toBe(false);
  });

  it("re-register cancels idle timer so stale callback cannot delete live entry", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/timer-cancel",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 5_000 },
    });

    await fetchResolved(scopeA, deferred, "v");
    scopeA.destroy();

    const firedGeneration = cacheStore.get("/timer-cancel")?.idleGeneration;

    const scopeB = createQueryScope<string>({
      key: "/timer-cancel",
      fetchFn: deferred.fetchFn,
    });
    expect(cacheStore.getConsumerCount("/timer-cancel")).toBe(1);

    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);
    expect(cacheStore.has("/timer-cancel")).toBe(true);
    expect(cacheStore.get("/timer-cancel")?.idleGeneration).not.toBe(
      firedGeneration
    );

    scopeB.destroy();
  });

  it("new live epoch with retentionTime 0 deletes immediately after prior 60s idle", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/epoch-reset",
      fetchFn: deferred.fetchFn,
    });

    await fetchResolved(scopeA, deferred, "old");
    scopeA.destroy();
    expect(cacheStore.has("/epoch-reset")).toBe(true);

    const scopeB = createQueryScope<string>({
      key: "/epoch-reset",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });
    expect(cacheStore.has("/epoch-reset")).toBe(true);

    scopeB.destroy();
    expect(cacheStore.has("/epoch-reset")).toBe(false);

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(cacheStore.has("/epoch-reset")).toBe(false);
  });

  it("overlapping consumers use max retention for the live epoch", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredFetch();
    const [scopeA, scopeB] = createQueryScopes<string>("/overlap", 2, {
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });
    const scopeC = createQueryScope<string>({
      key: "/overlap",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 10_000 },
    });

    const fetchPromise = scopeA.query.fetch();
    await deferred.resolvePending("data");
    await fetchPromise;

    scopeB.destroy();
    scopeC.destroy();
    scopeA.destroy();

    expect(cacheStore.has("/overlap")).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(cacheStore.has("/overlap")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cacheStore.has("/overlap")).toBe(false);
  });

  it("overlapping retention max is independent of destroy order", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredFetch();
    const scopeLong = createQueryScope<string>({
      key: "/overlap-order",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 8_000 },
    });
    const scopeShort = createQueryScope<string>({
      key: "/overlap-order",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });

    const fetchPromise = scopeLong.query.fetch();
    await deferred.resolvePending("x");
    await fetchPromise;

    scopeShort.destroy();
    scopeLong.destroy();

    vi.advanceTimersByTime(7_999);
    expect(cacheStore.has("/overlap-order")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cacheStore.has("/overlap-order")).toBe(false);
  });

  it("retained stale remount with SWR false hydrates and revalidates without blocking load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/retain-stale-swr-off",
      fetchFn: deferred.fetchFn,
      options: { ttl: 1_000, staleWhileRevalidate: false },
    });

    const first = scopeA.query.fetch();
    await deferred.resolvePending("stale-value");
    await first;
    scopeA.destroy();

    expect(cacheStore.has("/retain-stale-swr-off")).toBe(true);
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));

    const scopeB = createQueryScope<string>({
      key: "/retain-stale-swr-off",
      fetchFn: deferred.fetchFn,
      options: { ttl: 1_000, staleWhileRevalidate: false },
    });

    expect(scopeB.query.data()).toBe("stale-value");
    expect(scopeB.query.isLoading()).toBe(false);

    const refetch = scopeB.query.fetch();
    expect(scopeB.query.isFetching()).toBe(true);
    expect(scopeB.query.isLoading()).toBe(false);
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("fresh-value");
    await refetch;
    await flushMicrotasks();

    expect(scopeB.query.data()).toBe("fresh-value");
    expect(scopeB.query.isFetching()).toBe(false);
    scopeB.destroy();
  });

  it("retained stale remount with SWR true shows stale data during background revalidate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/retain-stale-swr-on",
      fetchFn: deferred.fetchFn,
      options: { ttl: 1_000, staleWhileRevalidate: true },
    });

    const first = scopeA.query.fetch();
    await deferred.resolvePending("stale-value");
    await first;
    scopeA.destroy();

    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));

    const scopeB = createQueryScope<string>({
      key: "/retain-stale-swr-on",
      fetchFn: deferred.fetchFn,
      options: { ttl: 1_000, staleWhileRevalidate: true },
    });

    expect(scopeB.query.data()).toBe("stale-value");
    expect(scopeB.query.isLoading()).toBe(false);

    const refetch = scopeB.query.fetch();
    expect(scopeB.query.isFetching()).toBe(true);
    expect(scopeB.query.isLoading()).toBe(false);
    expect(scopeB.query.data()).toBe("stale-value");
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("fresh-value");
    await refetch;
    await flushMicrotasks();

    expect(scopeB.query.data()).toBe("fresh-value");
    expect(scopeB.query.isFetching()).toBe(false);
    scopeB.destroy();
  });

  it("delete then recreate same key survives a stale idle timer callback", async () => {
    vi.useFakeTimers();
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/timer-race-delete",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 5_000 },
    });

    const first = scopeA.query.fetch();
    await deferred.resolvePending("old");
    await first;
    scopeA.destroy();

    const idleGeneration = cacheStore.get("/timer-race-delete")?.idleGeneration;
    expect(idleGeneration).toBeDefined();

    const clearTimeoutSpy = vi
      .spyOn(globalThis, "clearTimeout")
      .mockImplementation(() => undefined);

    cacheStore.delete("/timer-race-delete");
    clearTimeoutSpy.mockRestore();

    const scopeB = createQueryScope<string>({
      key: "/timer-race-delete",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 60_000 },
    });

    const second = scopeB.query.fetch();
    await deferred.resolvePending("new-authoritative");
    await second;
    await flushMicrotasks();

    expect(cacheStore.get("/timer-race-delete")?.data).toBe("new-authoritative");
    expect(cacheStore.getConsumerCount("/timer-race-delete")).toBe(1);

    vi.advanceTimersByTime(5_000);

    expect(cacheStore.has("/timer-race-delete")).toBe(true);
    expect(scopeB.query.data()).toBe("new-authoritative");

    scopeB.destroy();
  });

  it("fresh remount does not transport when cache is fresh", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/fresh-remount",
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });

    await fetchResolved(scopeA, deferred, "cached");
    scopeA.destroy();

    const scopeB = createQueryScope<string>({
      key: "/fresh-remount",
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });
    await scopeB.query.fetch();
    await flushMicrotasks();

    expect(deferred.callCount()).toBe(1);
    expect(scopeB.query.data()).toBe("cached");
    expect(scopeB.query.isFetching()).toBe(false);
    scopeB.destroy();
  });

  it("invalidates idle retained entry without extending retention timer", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/idle-inv",
      fetchFn: deferred.fetchFn,
    });

    await fetchResolved(scope, deferred, "stale");
    scope.destroy();

    invalidateCacheKey("/idle-inv");
    const entry = cacheStore.get("/idle-inv");
    expect(entry?.timestamp).toBe(0);
    expect(entry?.hasResolvedData).toBe(true);
    expect(entry?.data).toBe("stale");

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(cacheStore.has("/idle-inv")).toBe(true);
  });

  it("delete and clear cancel timers safely", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/clear-timer",
      fetchFn: deferred.fetchFn,
    });

    await fetchResolved(scope, deferred, "x");
    scope.destroy();

    cacheStore.delete("/clear-timer");
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(cacheStore.has("/clear-timer")).toBe(false);

    const scope2 = createQueryScope<string>({
      key: "/clear-all",
      fetchFn: deferred.fetchFn,
    });
    await fetchResolved(scope2, deferred, "y");
    scope2.destroy();
    cacheStore.clear();
    vi.advanceTimersByTime(60_000);
    expect(cacheStore.size()).toBe(0);
  });

  it("rejects invalid retentionTime at construction", () => {
    expect(() =>
      createQueryScope({
        key: "/bad",
        options: { retentionTime: -1 },
      })
    ).toThrow();

    expect(() =>
      createQueryScope({
        key: "/bad-nan",
        options: { retentionTime: Number.NaN },
      })
    ).toThrow();

    expect(() =>
      createQueryScope({
        key: "/bad-inf",
        options: { retentionTime: Number.POSITIVE_INFINITY },
      })
    ).toThrow();

    expect(() =>
      createQueryScope({
        key: "/bad-neg-inf",
        options: { retentionTime: Number.NEGATIVE_INFINITY },
      })
    ).toThrow();

    expect(() =>
      createQueryScope({
        key: "/bad-max",
        options: { retentionTime: MAX_RETENTION_MS + 1 },
      })
    ).toThrow();
  });

  it("A to B to A reuses A before expiry and cold-starts after expiry", async () => {
    const deferred = createDeferredFetch();
    const scopeA1 = createQueryScope<string>({
      key: "/aba-a",
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });
    await fetchResolved(scopeA1, deferred, "A-data");
    scopeA1.destroy();

    const scopeB = createQueryScope<string>({
      key: "/aba-b",
      fetchFn: deferred.fetchFn,
      options: { retentionTime: 0 },
    });
    await fetchResolved(scopeB, deferred, "B-data");
    scopeB.destroy();

    const scopeA2 = createQueryScope<string>({
      key: "/aba-a",
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });
    await scopeA2.query.fetch();
    await flushMicrotasks();
    expect(scopeA2.query.data()).toBe("A-data");
    expect(deferred.callCount()).toBe(2);
    scopeA2.destroy();

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_001);

    const scopeA3 = createQueryScope<string>({
      key: "/aba-a",
      fetchFn: deferred.fetchFn,
    });
    const cold = scopeA3.query.fetch();
    await deferred.resolvePending("A-cold");
    await cold;
    expect(scopeA3.query.data()).toBe("A-cold");
    expect(deferred.callCount()).toBe(3);
    scopeA3.destroy();
  });
});
