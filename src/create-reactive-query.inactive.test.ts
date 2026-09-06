import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import {
  createReactiveQueryScope,
  createQueryScope,
  flushReactiveEffects,
  signal,
} from "./test-support/angular-context";
import {
  createDeferredFetch,
  flushMicrotasks,
} from "./test-support/fetch-mock";
import type { QueryKey } from "./types";

describe("createReactiveQuery inactive state", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("I1. initially inactive — no fetch, no consumer", () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(0);
    expect(scope.query.data()).toBeNull();
    expect(scope.query.error()).toBeNull();
    expect(scope.query.loading()).toBe(false);
    expect(cacheStore.size()).toBe(0);
    scope.destroy();
  });

  it("I2. initially active — unchanged from R2", async () => {
    const key = signal<QueryKey | undefined>("/i2-b");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ id: number }>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(1);
    expect(scope.query.data()).toBeNull();
    expect(cacheStore.getConsumerCount("/i2-b")).toBe(1);

    await deferred.resolvePending({ id: 1 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ id: 1 });
    scope.destroy();
  });

  it("I3. inactive to A — register, hydrate, fetch", async () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(0);

    key.set("/i3-a");
    flushReactiveEffects();
    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.getConsumerCount("/i3-a")).toBe(1);

    await deferred.resolvePending("loaded");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("loaded");
    scope.destroy();
  });

  it("I4. A to inactive — release, clear state, abort sole in-flight", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/i4-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const key = signal<QueryKey | undefined>("/i4-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    expect(resolveA).not.toBeNull();

    key.set(undefined);
    flushReactiveEffects();

    expect(scope.query.data()).toBeNull();
    expect(scope.query.error()).toBeNull();
    expect(scope.query.loading()).toBe(false);
    expect(cacheStore.getConsumerCount("/i4-a")).toBe(0);
    expect(cacheStore.has("/i4-a")).toBe(false);

    scope.destroy();
  });

  it("I5. coalesced A to undefined to B — effective A to B", async () => {
    const key = signal<QueryKey | undefined>("/i5-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("A");

    key.set(undefined);
    key.set("/i5-b");
    flushReactiveEffects();

    await deferred.resolvePending("B");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("B");
    expect(deferred.callCount()).toBe(2);
    expect(cacheStore.getConsumerCount("/i5-a")).toBe(0);
    expect(cacheStore.getConsumerCount("/i5-b")).toBe(1);
    expect(cacheStore.has("/i5-a")).toBe(false);
    scope.destroy();
  });

  it("I6. coalesced inactive to B to C — C only", async () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    key.set("/i6-b");
    key.set("/i6-c");
    flushReactiveEffects();

    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.getConsumerCount("/i6-b")).toBe(0);
    expect(cacheStore.getConsumerCount("/i6-c")).toBe(1);

    await deferred.resolvePending("C");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("C");
    scope.destroy();
  });

  it("I7. A inFlight to inactive sole consumer — abort, no hang", async () => {
    const key = signal<QueryKey | undefined>("/i7-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(1);
    key.set(undefined);
    flushReactiveEffects();

    expect(cacheStore.has("/i7-a")).toBe(false);
    expect(scope.query.loading()).toBe(false);

    await deferred.resolvePending("late");
    await flushMicrotasks();
    expect(scope.query.data()).toBeNull();
    scope.destroy();
  });

  it("I8. A inFlight to inactive with shared consumer — A survives", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/i8-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const staticS = createQueryScope<string>({ key: "/i8-a", fetchFn });
    const inflightA = staticS.query.fetch();

    const key = signal<QueryKey | undefined>("/i8-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    key.set(undefined);
    flushReactiveEffects();

    expect(cacheStore.getConsumerCount("/i8-a")).toBe(1);
    expect(resolveA).not.toBeNull();

    resolveA!(new Response(JSON.stringify("A-value"), { status: 200 }));
    await inflightA;
    await flushMicrotasks();

    expect(staticS.query.data()).toBe("A-value");
    expect(scope.query.data()).toBeNull();
    scope.destroy();
    staticS.destroy();
  });

  it("I9. inactive to warm B cache — hydrate, no network if fresh TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    cacheStore.set("/i9-b", {
      data: "cached",
      timestamp: Date.now(),
      ttl: 60_000,
    });

    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    key.set("/i9-b");
    flushReactiveEffects();

    expect(deferred.callCount()).toBe(0);
    expect(scope.query.data()).toBe("cached");
    scope.destroy();
  });

  it("I10. inactive to stale B with SWR — stale then refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    cacheStore.set("/i10-b", {
      data: "stale",
      timestamp: Date.now() - 5_000,
      ttl: 1_000,
    });

    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 1_000, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });

    key.set("/i10-b");
    flushReactiveEffects();

    expect(scope.query.data()).toBe("stale");
    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending("fresh");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("fresh");
    scope.destroy();
  });

  it("I11. inactive to stale B without SWR — blocks until network", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    cacheStore.set("/i11-b", {
      data: "stale",
      timestamp: Date.now() - 5_000,
      ttl: 1_000,
    });

    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 1_000 },
      fetchFn: deferred.fetchFn,
    });

    key.set("/i11-b");
    flushReactiveEffects();
    expect(deferred.callCount()).toBe(1);
    expect(scope.query.loading()).toBe(true);

    await deferred.resolvePending("fresh");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("fresh");
    scope.destroy();
  });

  it("I12. inactive to B with existing B inFlight — join in-flight", async () => {
    const deferred = createDeferredFetch();
    const staticB = createQueryScope<string>({
      key: "/i12-b",
      fetchFn: deferred.fetchFn,
    });
    const bFetch = staticB.query.fetch();

    const key = signal<QueryKey | undefined>(undefined);
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    key.set("/i12-b");
    flushReactiveEffects();
    await flushMicrotasks();

    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending("shared");
    await bFetch;
    await flushMicrotasks();

    expect(scope.query.data()).toBe("shared");
    expect(staticB.query.data()).toBe("shared");
    expect(cacheStore.getConsumerCount("/i12-b")).toBe(2);
    scope.destroy();
    staticB.destroy();
  });

  it("I13. fetch while inactive — immediate resolve, no network", async () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await scope.query.fetch();
    expect(deferred.callCount()).toBe(0);
    scope.destroy();
  });

  it("I14. fetch(true) while inactive — same", async () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await scope.query.fetch(true);
    expect(deferred.callCount()).toBe(0);
    scope.destroy();
  });

  it("I15. invalidate while inactive — no-op", async () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    scope.query.invalidate();
    expect(cacheStore.size()).toBe(0);
    scope.destroy();
  });

  it("I16. destroy while inactive — no consumer leak", () => {
    const key = signal<QueryKey | undefined>(undefined);
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    scope.destroy();
    expect(cacheStore.size()).toBe(0);
  });

  it("I17. same serialized active key re-emit — no duplicate fetch", async () => {
    const key = signal<QueryKey | undefined>("/i17");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("first");
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);

    key.set("/i17");
    flushReactiveEffects();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);
    scope.destroy();
  });

  it("I18. late A settlement after inactive — ignored", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/i18-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      throw new Error(`unexpected url ${url}`);
    }) as typeof fetch;

    const key = signal<QueryKey | undefined>("/i18-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    key.set(undefined);
    flushReactiveEffects();

    resolveA!(new Response(JSON.stringify("A-late"), { status: 200 }));
    await flushMicrotasks();

    expect(scope.query.data()).toBeNull();
    scope.destroy();
  });

  it("I19. late A settlement after B — ignored", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/i19-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return new Response(JSON.stringify("B-data"), { status: 200 });
    }) as typeof fetch;

    const key = signal<QueryKey | undefined>("/i19-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    key.set("/i19-b");
    flushReactiveEffects();
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B-data");

    resolveA!(new Response(JSON.stringify("A-late"), { status: 200 }));
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B-data");
    scope.destroy();
  });

  it("I20. force refresh race unchanged", async () => {
    const key = signal<QueryKey | undefined>("/i20");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("v1");
    await flushMicrotasks();

    const forced = scope.query.fetch(true);
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending("v2");
    await forced;
    await flushMicrotasks();

    expect(scope.query.data()).toBe("v2");
    scope.destroy();
  });

  it("I21. effect tracks key signal only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal<QueryKey | undefined>("/i21");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("first");
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);

    await scope.query.fetch();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);

    key.set(undefined);
    flushReactiveEffects();
    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.getConsumerCount("/i21")).toBe(0);

    key.set("/i21");
    flushReactiveEffects();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("again");
    await flushMicrotasks();
    scope.destroy();
  });

  it("I22. empty string key activates, fetches, releases on inactive", async () => {
    const key = signal<QueryKey | undefined>("");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.getConsumerCount("")).toBe(1);

    await deferred.resolvePending("empty-key");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("empty-key");

    key.set(undefined);
    flushReactiveEffects();
    expect(cacheStore.getConsumerCount("")).toBe(0);
    expect(scope.query.data()).toBeNull();

    scope.destroy();
    expect(cacheStore.has("")).toBe(false);
  });
});
