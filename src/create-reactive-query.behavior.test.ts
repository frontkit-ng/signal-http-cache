import { Component } from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import { createReactiveQuery } from "./create-reactive-query";
import {
  createReactiveQueryScope,
  createQueryScope,
  flushReactiveEffects,
  signal,
} from "./test-support/angular-context";
import { TestBed } from "@angular/core/testing";
import {
  createDeferredFetch,
  flushMicrotasks,
} from "./test-support/fetch-mock";

describe("createReactiveQuery behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("R2. initial bind uncached B auto-fetches", async () => {
    const key = signal("/r2-b");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ id: number }>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(1);
    expect(scope.query.data()).toBeNull();
    expect(cacheStore.getConsumerCount("/r2-b")).toBe(1);

    await deferred.resolvePending({ id: 1 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ id: 1 });
    scope.destroy();
  });

  it("R2b. immediate fetch after construction targets initial key", async () => {
    const key = signal("/r2b");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("initial");
    await flushMicrotasks();

    const manual = scope.query.fetch();
    expect(deferred.callCount()).toBe(1);
    await manual;

    expect(scope.query.data()).toBe("initial");
    scope.destroy();
  });

  it("R2c. immediate invalidate after construction targets initial key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal("/r2c");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ v: number }>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: 1 });
    await flushMicrotasks();

    scope.query.invalidate();
    expect(cacheStore.get("/r2c")?.timestamp).toBe(0);

    const refetch = scope.query.fetch();
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await refetch;

    expect(scope.query.data()).toEqual({ v: 2 });
    scope.destroy();
  });

  it("R3. A to B uncached clears data and loads B", async () => {
    const key = signal<"/r3-a" | "/r3-b">("/r3-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ v: string }>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: "A" });
    await flushMicrotasks();
    expect(scope.query.data()).toEqual({ v: "A" });

    key.set("/r3-b");
    flushReactiveEffects();
    expect(scope.query.data()).toBeNull();

    await deferred.resolvePending({ v: "B" });
    await flushMicrotasks();
    expect(scope.query.data()).toEqual({ v: "B" });
    expect(deferred.callCount()).toBe(2);
    scope.destroy();
  });

  it("R5. A to B stale cache with SWR shows stale B then refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    cacheStore.set("/r5-b", {
      data: { v: "stale" },
      timestamp: Date.now() - 5_000,
      ttl: 1_000,
    });

    const key = signal<"/r5-a" | "/r5-b">("/r5-a");
    const scope = createReactiveQueryScope<{ v: string }>({
      key,
      options: { ttl: 1_000, staleWhileRevalidate: true },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: "A" });
    await flushMicrotasks();
    expect(scope.query.data()).toEqual({ v: "A" });

    key.set("/r5-b");
    flushReactiveEffects();

    expect(scope.query.data()).toEqual({ v: "stale" });
    expect(scope.query.data()).not.toEqual({ v: "A" });
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: "fresh" });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: "fresh" });
    scope.destroy();
  });

  it("R6. A to B stale cache without SWR fetches B", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    cacheStore.set("/r6-b", {
      data: { v: "stale" },
      timestamp: Date.now() - 5_000,
      ttl: 1_000,
    });

    const deferred = createDeferredFetch();
    const key = signal<"/r6-a" | "/r6-b">("/r6-a");
    const scope = createReactiveQueryScope<{ v: string }>({
      key,
      options: { ttl: 1_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: "A" });
    await flushMicrotasks();

    key.set("/r6-b");
    flushReactiveEffects();

    expect(scope.query.data()).not.toEqual({ v: "A" });
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: "B-fresh" });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: "B-fresh" });
    scope.destroy();
  });

  it("R4. A to B fresh cache hit does not call transport again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    cacheStore.set("/r4-b", {
      data: { v: 99 },
      timestamp: Date.now(),
      ttl: 60_000,
    });

    const key = signal<"/r4-a" | "/r4-b">("/r4-a");
    const scope = createReactiveQueryScope<{ v: number }>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: 1 });
    await flushMicrotasks();

    key.set("/r4-b");
    flushReactiveEffects();
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 99 });
    expect(deferred.callCount()).toBe(1);
    scope.destroy();
  });

  it("R8. A in flight with shared consumer survives reactive A to B", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/r8-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return new Response(JSON.stringify("B-value"), { status: 200 });
    }) as typeof fetch;

    const staticS = createQueryScope<string>({ key: "/r8-a", fetchFn });
    const inflightA = staticS.query.fetch();
    expect(cacheStore.get("/r8-a")?.inFlight).toBeDefined();

    const key = signal<"/r8-a" | "/r8-b">("/r8-a");
    const reactiveR = createReactiveQueryScope<string>({ key, fetchFn });

    key.set("/r8-b");
    flushReactiveEffects();

    expect(cacheStore.getConsumerCount("/r8-a")).toBe(1);
    expect(resolveA).not.toBeNull();

    resolveA!(new Response(JSON.stringify("A-value"), { status: 200 }));
    await inflightA;
    await flushMicrotasks();

    expect(staticS.query.data()).toBe("A-value");
    expect(cacheStore.get("/r8-a")?.data).toBe("A-value");

    await flushMicrotasks();

    expect(reactiveR.query.data()).toBe("B-value");
    expect(staticS.query.data()).toBe("A-value");
    expect(cacheStore.getConsumerCount("/r8-a")).toBe(1);
    expect(cacheStore.getConsumerCount("/r8-b")).toBe(1);

    reactiveR.destroy();
    staticS.destroy();
  });

  it("R11. reactive joins existing B inFlight on A to B transition", async () => {
    const deferred = createDeferredFetch();
    const key = signal<"/r11-a" | "/r11-b">("/r11-a");
    const reactive = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();

    const staticB = createQueryScope<string>({
      key: "/r11-b",
      fetchFn: deferred.fetchFn,
    });
    const bFetch = staticB.query.fetch();

    key.set("/r11-b");
    flushReactiveEffects();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("B-shared");
    await bFetch;
    await flushMicrotasks();

    expect(reactive.query.data()).toBe("B-shared");
    expect(staticB.query.data()).toBe("B-shared");
    expect(deferred.callCount()).toBe(2);
    expect(cacheStore.getConsumerCount("/r11-b")).toBe(2);

    reactive.destroy();
    staticB.destroy();
  });

  it("R7. A in flight sole consumer to B aborts A", async () => {
    const key = signal<"/r7-a" | "/r7-b">("/r7-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(deferred.callCount()).toBe(1);
    key.set("/r7-b");
    flushReactiveEffects();
    await deferred.resolvePending("B");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("B");
    expect(cacheStore.has("/r7-a")).toBe(false);
    scope.destroy();
  });

  it("R9. A completion after B active does not overwrite local data", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/r9-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return new Response(JSON.stringify("B-data"), { status: 200 });
    }) as typeof fetch;

    const staticA = createQueryScope<string>({ key: "/r9-a", fetchFn });
    const key = signal<"/r9-a" | "/r9-b">("/r9-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    key.set("/r9-b");
    flushReactiveEffects();
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B-data");

    resolveA!(new Response(JSON.stringify("A-late"), { status: 200 }));
    await flushMicrotasks();

    expect(scope.query.data()).toBe("B-data");
    scope.destroy();
    staticA.destroy();
  });

  it("R10. two reactive consumers converge on B", async () => {
    TestBed.resetTestingModule();

    const keyA = signal("/r10-b");
    const keyB = signal("/r10-b");
    const deferred = createDeferredFetch();

    @Component({ standalone: true, template: "", host: { "data-host": "a" } })
    class HostA {
      readonly query = createReactiveQuery<string>(keyA, {}, deferred.fetchFn);
    }

    @Component({ standalone: true, template: "", host: { "data-host": "b" } })
    class HostB {
      readonly query = createReactiveQuery<string>(keyB, {}, deferred.fetchFn);
    }

    TestBed.configureTestingModule({ imports: [HostA, HostB] });
    const fixtureA = TestBed.createComponent(HostA);
    const fixtureB = TestBed.createComponent(HostB);

    expect(deferred.callCount()).toBe(1);

    await deferred.resolvePending("shared");
    await flushMicrotasks();

    expect(fixtureA.componentInstance.query.data()).toBe("shared");
    expect(fixtureB.componentInstance.query.data()).toBe("shared");

    fixtureA.destroy();
    fixtureB.destroy();
    TestBed.resetTestingModule();
  });

  it("R12. coalesced A set B set C activates C only", async () => {
    const key = signal<"/r12-a" | "/r12-b" | "/r12-c">("/r12-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("A");

    key.set("/r12-b");
    key.set("/r12-c");
    flushReactiveEffects();
    await deferred.resolvePending("C");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("C");
    expect(deferred.callCount()).toBe(2);
    expect(cacheStore.getConsumerCount("/r12-b")).toBe(0);
    expect(cacheStore.getConsumerCount("/r12-c")).toBe(1);
    expect(cacheStore.has("/r12-b")).toBe(false);
    scope.destroy();
  });

  it("R12b. before effect flush A remains active for fetch", async () => {
    const key = signal<"/r12b-a" | "/r12b-b">("/r12b-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A-data");
    await flushMicrotasks();

    key.set("/r12b-b");
    const manual = scope.query.fetch();
    await manual;
    expect(deferred.callCount()).toBe(1);

    flushReactiveEffects();
    await deferred.resolvePending("B-data");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B-data");

    scope.destroy();
  });

  it("R13. same key re-emitted does not duplicate fetch", async () => {
    const key = signal("/r13");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("ok");
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);

    key.set("/r13");
    flushReactiveEffects();
    await flushMicrotasks();

    expect(deferred.callCount()).toBe(1);
    scope.destroy();
  });

  it("R15. manual fetch uses current active key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal<"/r15-a" | "/r15-b">("/r15-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();
    key.set("/r15-b");
    flushReactiveEffects();
    await deferred.resolvePending("B");
    await flushMicrotasks();

    vi.setSystemTime(new Date("2026-01-01T00:01:00.001Z"));
    const manual = scope.query.fetch();
    expect(deferred.callCount()).toBe(3);
    await deferred.resolvePending("B-manual");
    await manual;

    expect(scope.query.data()).toBe("B-manual");
    scope.destroy();
  });

  it("R16. fetch(true) force refreshes active key only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal("/r16");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ v: number }>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: 1 });
    await flushMicrotasks();

    const forced = scope.query.fetch(true);
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await forced;

    expect(scope.query.data()).toEqual({ v: 2 });
    scope.destroy();
  });

  it("R17. invalidate targets active key only", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal<"/r17-a" | "/r17-b">("/r17-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<{ v: number }>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending({ v: 1 });
    await flushMicrotasks();

    key.set("/r17-b");
    flushReactiveEffects();
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    scope.query.invalidate();
    expect(cacheStore.get("/r17-b")?.timestamp).toBe(0);
    expect(cacheStore.has("/r17-a")).toBe(false);

    scope.destroy();
  });

  it("R18. error on A cleared on transition to B", async () => {
    const key = signal<"/r18-a" | "/r18-b">("/r18-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.rejectPending({ message: "HTTP 500", status: 500 });
    await flushMicrotasks();
    expect(scope.query.error()?.message).toContain("HTTP 500");

    key.set("/r18-b");
    flushReactiveEffects();
    expect(scope.query.error()).toBeNull();

    await deferred.resolvePending("B-ok");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B-ok");
    scope.destroy();
  });

  it("R20. initial key with warm cache hydrates without network", async () => {
    const warm = createReactiveQueryScope<{ v: number }>({
      key: signal("/r20"),
      options: { ttl: 60_000 },
      fetchFn: createDeferredFetch().fetchFn,
    });
    warm.destroy();

    cacheStore.set("/r20", {
      data: { v: 42 },
      timestamp: Date.now(),
      ttl: 60_000,
    });

    const deferred = createDeferredFetch();
    const key = signal("/r20");
    const scope = createReactiveQueryScope<{ v: number }>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    expect(scope.query.data()).toEqual({ v: 42 });
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(0);

    scope.destroy();
  });

  it("R19. loading during uncached B transition resists late A settlement", async () => {
    let resolveA: ((response: Response) => void) | null = null;
    const deferredB = createDeferredFetch();
    const fetchFn = (async (url: string, init?: RequestInit) => {
      if (url === "/r19-a") {
        return new Promise<Response>((resolve, reject) => {
          resolveA = resolve;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }
      return deferredB.fetchFn(url, init);
    }) as typeof fetch;

    const key = signal<"/r19-a" | "/r19-b">("/r19-a");
    const scope = createReactiveQueryScope<string>({ key, fetchFn });

    key.set("/r19-b");
    flushReactiveEffects();

    expect(scope.query.data()).toBeNull();
    expect(scope.query.loading()).toBe(true);

    resolveA!(new Response(JSON.stringify("A-late"), { status: 200 }));
    await flushMicrotasks();

    expect(scope.query.loading()).toBe(true);
    expect(scope.query.data()).toBeNull();

    await deferredB.resolvePending("B-data");
    await flushMicrotasks();

    expect(scope.query.loading()).toBe(false);
    expect(scope.query.data()).toBe("B-data");

    scope.destroy();
  });

  it("R21. effect depends on key signal only not query-local signals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const key = signal<"/r21" | "/r21-other">("/r21");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("first");
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.getConsumerCount("/r21")).toBe(1);

    await scope.query.fetch();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(1);

    const forced = scope.query.fetch(true);
    expect(scope.query.loading()).toBe(true);
    await deferred.resolvePending("second");
    await forced;
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(2);

    flushReactiveEffects();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(2);
    expect(cacheStore.getConsumerCount("/r21")).toBe(1);

    key.set("/r21");
    flushReactiveEffects();
    await flushMicrotasks();
    expect(deferred.callCount()).toBe(2);

    key.set("/r21-other");
    flushReactiveEffects();
    expect(deferred.callCount()).toBe(3);

    await deferred.resolvePending("other");
    await flushMicrotasks();
    expect(cacheStore.getConsumerCount("/r21")).toBe(0);
    expect(cacheStore.getConsumerCount("/r21-other")).toBe(1);

    scope.destroy();
  });

  it("R22. key transition via effect does not throw NG0600", async () => {
    const key = signal<"/r22-a" | "/r22-b">("/r22-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();

    key.set("/r22-b");
    expect(() => flushReactiveEffects()).not.toThrow();
    await deferred.resolvePending("B");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("B");
    scope.destroy();
  });
});
