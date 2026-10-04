import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import {
  createQueryScope,
  createQueryScopes,
  createReactiveQueryScope,
  ensureReactiveTestEnvironment,
  flushReactiveEffects,
  signal,
} from "./test-support/angular-context";
import type { WritableSignal } from "@angular/core";
import {
  createDeferredFetch,
  createSequentialFetch,
  flushMicrotasks,
  jsonResponse,
} from "./test-support/fetch-mock";
import type { QueryKey } from "./types";

describe("query fetch status", () => {
  ensureReactiveTestEnvironment();

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T1 static never fetched", () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/t1",
      fetchFn: deferred.fetchFn,
    });
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T2 initial fetch", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ n: number }>({
      key: "/t2",
      fetchFn: deferred.fetchFn,
    });
    const p = scope.query.fetch();
    expect(scope.query.isLoading()).toBe(true);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending({ n: 1 });
    await p;
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T3 fresh cache hit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/t3",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    await scope.query.fetch();
    expect(deferred.callCount()).toBe(1);
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T4 SWR background", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/t4",
      options: { ttl: 1_000, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    void scope.query.fetch();
    expect(scope.query.data()).toEqual({ v: 1 });
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T5 invalidation with resolved data", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/t5",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T6 force refresh with data", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/t6",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    const forced = scope.query.fetch(true);
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await forced;
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T7 join shared in-flight", async () => {
    const deferred = createDeferredFetch();
    const [a, b] = createQueryScopes<string>("/t7", 2, {
      fetchFn: deferred.fetchFn,
    });
    void a.query.fetch();
    const join = b.query.fetch();
    expect(deferred.callCount()).toBe(1);
    expect(a.query.isFetching()).toBe(true);
    expect(b.query.isFetching()).toBe(true);
    await deferred.resolvePending("ok");
    await join;
    expect(a.query.isFetching()).toBe(false);
    expect(b.query.isFetching()).toBe(false);
    a.destroy();
    b.destroy();
  });

  it("T8 initial failure", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<unknown>({ key: "/t8", fetchFn: deferred.fetchFn });
    const p = scope.query.fetch();
    await deferred.rejectPending({ message: "HTTP 500", status: 500 });
    await p;
    expect(scope.query.error()).not.toBeNull();
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T9 SWR background failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const sequential = createSequentialFetch([
      async () => jsonResponse({ v: 1 }),
      async () => {
        throw { message: "HTTP 500", status: 500 };
      },
    ]);
    const scope = createQueryScope<{ v: number }>({
      key: "/t9",
      options: { ttl: 500, staleWhileRevalidate: true },
      fetchFn: sequential.fetchFn,
    });
    await scope.query.fetch();
    await flushMicrotasks();
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await scope.query.fetch();
    await flushMicrotasks();
    expect(scope.query.data()).toEqual({ v: 1 });
    expect(scope.query.error()?.message).toContain("HTTP 500");
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T10 reactive inactive", () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({ key, fetchFn: deferred.fetchFn });
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    expect(scope.query.data()).toBeNull();
    expect(scope.query.error()).toBeNull();
    scope.destroy();
  });

  it("T11 key migration late A does not resolve B", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const deferredB = createDeferredFetch();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/t11-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return deferredB.fetchFn(url, init);
    }) as typeof fetch;

    const key = signal<"/t11-a" | "/t11-b">("/t11-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });
    key.set("/t11-b");
    flushReactiveEffects();
    expect(scope.query.isLoading()).toBe(true);
    expect(scope.query.isFetching()).toBe(true);
    resolveA!(jsonResponse("A-late"));
    await flushMicrotasks();
    expect(scope.query.data()).toBeNull();
    expect(scope.query.isLoading()).toBe(true);
    await deferredB.resolvePending("B");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B");
    scope.destroy();
  });

  it("T12 same-key force supersession keeps isFetching true", async () => {
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
      return new Promise<Response>((resolve) => {
        resolveB = resolve;
      });
    }) as typeof fetch;

    const scope = createQueryScope<string>({ key: "/t12", fetchFn });
    void scope.query.fetch();
    const forced = scope.query.fetch(true);
    expect(scope.query.isFetching()).toBe(true);
    resolveA!(jsonResponse("stale"));
    await flushMicrotasks();
    expect(scope.query.isFetching()).toBe(true);
    resolveB!(jsonResponse("winner"));
    await forced;
    expect(scope.query.isFetching()).toBe(false);
    expect(scope.query.data()).toBe("winner");
    scope.destroy();
  });

  it("T13 joiner invalidate successor", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/t13",
      fetchFn: deferred.fetchFn,
    });
    const join = scope.query.fetch();
    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending("after");
    await join;
    await flushMicrotasks();
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T14 successful JSON null", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<null>({ key: "/t14", fetchFn: deferred.fetchFn });
    const first = scope.query.fetch();
    await deferred.resolvePendingWithResponse(jsonResponse(null));
    await first;
    expect(scope.query.data()).toBeNull();
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    const second = scope.query.fetch(true);
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePendingWithResponse(jsonResponse(null));
    await second;
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });

  it("T15 passive same-key consumer", async () => {
    const deferred = createDeferredFetch();
    const [a, b] = createQueryScopes<string>("/t15", 2, {
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });
    const first = a.query.fetch();
    await deferred.resolvePending("v1");
    await first;
    const forced = a.query.fetch(true);
    expect(a.query.isFetching()).toBe(true);
    expect(b.query.isFetching()).toBe(false);
    await deferred.resolvePending("v2");
    await forced;
    b.destroy();
    a.destroy();
  });

  it("T16 invalidation fan-out", async () => {
    const deferred = createDeferredFetch();
    const [a, b] = createQueryScopes<{ v: number }>("/t16", 2, {
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });
    const firstA = a.query.fetch();
    const firstB = b.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await Promise.all([firstA, firstB]);
    a.query.invalidate();
    expect(deferred.callCount()).toBe(2);
    expect(a.query.isFetching()).toBe(true);
    expect(b.query.isFetching()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();
    expect(a.query.isFetching()).toBe(false);
    expect(b.query.isFetching()).toBe(false);
    a.destroy();
    b.destroy();
  });
});

describe("HttpQuery loading (0.6.0 compatibility)", () => {
  it("C1 revalidate sets loading during network (initial fetch)", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({ key: "/c1", fetchFn: deferred.fetchFn });
    const p = scope.query.fetch();
    expect(scope.query.loading()).toBe(true);
    expect(scope.query.isLoading()).toBe(true);
    await deferred.resolvePending("ok");
    await p;
    expect(scope.query.loading()).toBe(false);
    scope.destroy();
  });

  it("C2 SWR background: loading true while isLoading false", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/c2",
      options: { ttl: 1_000, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    void scope.query.fetch();
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.loading()).toBe(true);
    expect(scope.query.isFetching()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();
    expect(scope.query.loading()).toBe(false);
    scope.destroy();
  });

  it("C3 join: joiner loading false, both isFetching true", async () => {
    const deferred = createDeferredFetch();
    const [a, b] = createQueryScopes<string>("/c3", 2, {
      fetchFn: deferred.fetchFn,
    });
    void a.query.fetch();
    const join = b.query.fetch();
    expect(a.query.loading()).toBe(true);
    expect(b.query.loading()).toBe(false);
    expect(a.query.isFetching()).toBe(true);
    expect(b.query.isFetching()).toBe(true);
    await deferred.resolvePending("ok");
    await join;
    expect(a.query.loading()).toBe(false);
    expect(b.query.loading()).toBe(false);
    a.destroy();
    b.destroy();
  });

  it("C4 invalidation refetch: loading true while isLoading false", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/c4",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });
    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    scope.query.invalidate();
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.loading()).toBe(true);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();
    expect(scope.query.loading()).toBe(false);
    scope.destroy();
  });
});

describe("HttpQuery readonly state signals", () => {
  it("rejects public mutation of loading, isLoading, and isFetching at compile time", () => {
    const scope = createQueryScope<string>({ key: "/readonly" });
    // @ts-expect-error loading is readonly on HttpQuery
    const _legacy: WritableSignal<boolean> = scope.query.loading;
    // @ts-expect-error isLoading is readonly on HttpQuery
    const _loading: WritableSignal<boolean> = scope.query.isLoading;
    // @ts-expect-error isFetching is readonly on HttpQuery
    const _fetching: WritableSignal<boolean> = scope.query.isFetching;
    void _legacy;
    void _loading;
    void _fetching;
    expect(scope.query.loading()).toBe(false);
    expect(scope.query.isLoading()).toBe(false);
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });
});
