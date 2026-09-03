import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import { createQueryScope } from "./test-support/angular-context";
import {
  createDeferredFetch,
  createSequentialFetch,
  flushMicrotasks,
  jsonResponse,
} from "./test-support/fetch-mock";

describe("createQuery behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. initial successful fetch exposes data and clears inFlight", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ id: number }>({
      key: "/users",
      fetchFn: deferred.fetchFn,
    });

    const fetchPromise = scope.query.fetch();
    expect(scope.query.loading()).toBe(true);
    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending({ id: 1 });
    await fetchPromise;

    expect(scope.query.data()).toEqual({ id: 1 });
    expect(scope.query.loading()).toBe(false);
    expect(scope.query.error()).toBeNull();
    expect(cacheStore.has("/users")).toBe(true);
    expect(cacheStore.get("/users")?.inFlight).toBeUndefined();

    scope.destroy();
  });

  it("2. fresh TTL cache hit does not call transport again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/ttl-hit",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;

    vi.setSystemTime(new Date("2026-01-01T00:00:30.000Z"));
    await scope.query.fetch();

    expect(deferred.callCount()).toBe(1);
    expect(scope.query.data()).toEqual({ v: 1 });

    scope.destroy();
  });

  it("3. TTL expiry triggers a new transport request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/ttl-expire",
      options: { ttl: 1_000 },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;

    vi.setSystemTime(new Date("2026-01-01T00:00:01.001Z"));
    const secondFetch = scope.query.fetch();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: 2 });
    await secondFetch;

    expect(scope.query.data()).toEqual({ v: 2 });

    scope.destroy();
  });

  it("4. ttl: 0 always revalidates on subsequent fetch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ n: number }>({
      key: "/ttl-zero",
      options: { ttl: 0 },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ n: 1 });
    await firstFetch;

    vi.setSystemTime(new Date("2026-01-01T00:00:00.001Z"));
    const secondFetch = scope.query.fetch();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ n: 2 });
    await secondFetch;

    expect(scope.query.data()).toEqual({ n: 2 });

    scope.destroy();
  });

  it("5. in-flight deduplication on same query instance", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/dedup-same",
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    const second = scope.query.fetch();

    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending("ok");
    await Promise.all([first, second]);

    expect(scope.query.data()).toBe("ok");
    expect(scope.query.error()).toBeNull();

    scope.destroy();
  });

  it("6. in-flight deduplication across multiple consumers", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/dedup-multi",
      fetchFn: deferred.fetchFn,
    });
    const scopeB = createQueryScope<string>({
      key: "/dedup-multi",
      fetchFn: deferred.fetchFn,
    });

    const first = scopeA.query.fetch();
    const second = scopeB.query.fetch();

    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending("shared");
    await Promise.all([first, second]);

    expect(scopeA.query.data()).toBe("shared");
    expect(scopeB.query.data()).toBe("shared");

    scopeA.destroy();
    scopeB.destroy();
  });

  it("7. different keys do not deduplicate", async () => {
    const deferredA = createDeferredFetch();
    const deferredB = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/key-a",
      fetchFn: deferredA.fetchFn,
    });
    const scopeB = createQueryScope<string>({
      key: "/key-b",
      fetchFn: deferredB.fetchFn,
    });

    const first = scopeA.query.fetch();
    const second = scopeB.query.fetch();

    expect(deferredA.callCount()).toBe(1);
    expect(deferredB.callCount()).toBe(1);

    await deferredA.resolvePending("a");
    await first;
    await deferredB.resolvePending("b");
    await second;

    scopeA.destroy();
    scopeB.destroy();
  });

  it("8. failed request clears active inFlight and surfaces error", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<unknown>({
      key: "/fail",
      fetchFn: deferred.fetchFn,
    });

    const fetchPromise = scope.query.fetch();
    await deferred.rejectPending({ message: "HTTP 500", status: 500 });
    await fetchPromise;

    expect(scope.query.error()?.message).toContain("HTTP 500");
    expect(scope.query.loading()).toBe(false);
    expect(cacheStore.get("/fail")?.inFlight).toBeUndefined();

    scope.destroy();
  });

  it("9. failure recovery performs a second transport request", async () => {
    const sequential = createSequentialFetch([
      async () => {
        throw { message: "HTTP 500", status: 500 };
      },
      async () => jsonResponse({ ok: true }),
    ]);

    const scope = createQueryScope<{ ok: boolean }>({
      key: "/fail-recover",
      fetchFn: sequential.fetchFn,
    });

    await scope.query.fetch();
    expect(scope.query.error()).not.toBeNull();
    expect(sequential.callCount()).toBe(1);

    await scope.query.fetch();

    expect(sequential.callCount()).toBe(2);
    expect(scope.query.error()).toBeNull();
    expect(scope.query.data()).toEqual({ ok: true });
    expect(cacheStore.get("/fail-recover")?.inFlight).toBeUndefined();

    scope.destroy();
  });

  it("10. invalidate aborts active request without poisoning key", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/abort-invalidate",
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    scope.query.invalidate();
    await first;

    expect(cacheStore.get("/abort-invalidate")?.inFlight).toBeUndefined();

    const second = scope.query.fetch();
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending("after");
    await second;

    expect(scope.query.data()).toBe("after");

    scope.destroy();
  });

  it("11. abort joiners settle without hanging", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/abort-joiners",
      fetchFn: deferred.fetchFn,
    });
    const scopeB = createQueryScope<string>({
      key: "/abort-joiners",
      fetchFn: deferred.fetchFn,
    });

    const initiator = scopeA.query.fetch();
    const joiner = scopeB.query.fetch();
    scopeA.query.invalidate();

    await expect(Promise.all([initiator, joiner])).resolves.toBeDefined();

    scopeA.destroy();
    scopeB.destroy();
  });

  it("12. fetch(true) bypasses fresh cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/force-bypass",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;

    await scope.query.fetch();
    expect(deferred.callCount()).toBe(1);

    const forced = scope.query.fetch(true);
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await forced;

    expect(scope.query.data()).toEqual({ v: 2 });

    scope.destroy();
  });

  it("13. fetch(true) while request active supersedes in-flight work", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/force-active",
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    const forced = scope.query.fetch(true);

    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("second");
    await forced;
    await first;

    expect(scope.query.data()).toBe("second");

    scope.destroy();
  });

  it("14. stale completion cannot corrupt superseding force-refresh request", async () => {
    let call = 0;
    let resolveA: ((response: Response) => void) | null = null;
    let resolveB: ((response: Response) => void) | null = null;

    const fetchFn = (async (_url: string, init?: RequestInit) => {
      call++;
      if (call === 1) {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      if (call === 2) {
        return new Promise<Response>((resolve) => {
          resolveB = resolve;
        });
      }
      throw new Error(`Unexpected fetch call #${call}`);
    }) as typeof fetch;

    const scope = createQueryScope<string>({
      key: "/stale-race",
      fetchFn,
    });

    const first = scope.query.fetch();
    expect(call).toBe(1);
    expect(cacheStore.get("/stale-race")?.inFlight).toBeDefined();

    const forced = scope.query.fetch(true);
    expect(call).toBe(2);
    expect(cacheStore.get("/stale-race")?.inFlight).toBeDefined();

    resolveA!(jsonResponse("A-old"));
    await flushMicrotasks();

    expect(cacheStore.get("/stale-race")?.data).not.toBe("A-old");
    expect(scope.query.data()).not.toBe("A-old");
    expect(cacheStore.get("/stale-race")?.inFlight).toBeDefined();

    resolveB!(jsonResponse("B-new"));
    await forced;
    await first;

    expect(call).toBe(2);
    expect(cacheStore.get("/stale-race")?.inFlight).toBeUndefined();
    expect(cacheStore.get("/stale-race")?.data).toBe("B-new");
    expect(scope.query.data()).toBe("B-new");

    scope.destroy();
  });
});

describe("createQuery invalidation", () => {
  it("21. invalidate marks cache stale and subsequent fetch refetches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/invalidate",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;
    expect(cacheStore.get("/invalidate")?.data).toEqual({ v: 1 });

    scope.query.invalidate();
    expect(cacheStore.get("/invalidate")?.timestamp).toBe(0);
    expect(cacheStore.get("/invalidate")?.data).toEqual({ v: 1 });

    const refetch = scope.query.fetch();
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await refetch;

    expect(scope.query.data()).toEqual({ v: 2 });

    scope.destroy();
  });
});

describe("createQuery stale-while-revalidate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("23. serves stale data immediately and starts background refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/swr",
      options: { ttl: 1_000, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const swrFetch = scope.query.fetch();

    expect(scope.query.data()).toEqual({ v: 1 });
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: 2 });
    await swrFetch;
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 2 });
    expect(cacheStore.get("/swr")?.inFlight).toBeUndefined();

    scope.destroy();
  });

  it("24. SWR background success updates cache timestamp and data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/swr-success",
      options: { ttl: 500, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstFetch;
    const firstTimestamp = cacheStore.get("/swr-success")?.timestamp;

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await scope.query.fetch();
    await deferred.resolvePending({ v: 9 });
    await flushMicrotasks();

    expect(cacheStore.get("/swr-success")?.data).toEqual({ v: 9 });
    expect(cacheStore.get("/swr-success")?.timestamp).toBeGreaterThan(
      firstTimestamp ?? 0
    );

    scope.destroy();
  });

  it("25. SWR background failure retains stale data and sets error on initiator", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const sequential = createSequentialFetch([
      async () => jsonResponse({ v: 1 }),
      async () => {
        throw { message: "HTTP 500", status: 500 };
      },
      async () => jsonResponse({ v: 3 }),
    ]);

    const scope = createQueryScope<{ v: number }>({
      key: "/swr-fail",
      options: { ttl: 500, staleWhileRevalidate: true },
      fetchFn: sequential.fetchFn,
    });

    const firstFetch = scope.query.fetch();
    await firstFetch;
    expect(scope.query.data()).toEqual({ v: 1 });

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await scope.query.fetch();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 1 });
    expect(scope.query.error()?.message).toContain("HTTP 500");
    expect(cacheStore.get("/swr-fail")?.inFlight).toBeUndefined();

    const retry = scope.query.fetch();
    expect(sequential.callCount()).toBe(3);
    await retry;

    scope.destroy();
  });
});
