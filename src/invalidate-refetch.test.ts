import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import { createBaseMutation } from "./create-base-mutation";
import { createMutation } from "./create-mutation";
import {
  createQueryScope,
  createQueryScopes,
} from "./test-support/angular-context";
import {
  createDeferredFetch,
  createSequentialFetch,
  flushMicrotasks,
  jsonResponse,
} from "./test-support/fetch-mock";

describe("P1 invalidation auto-refetch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("P1-1 eligible static query.invalidate auto-refreshes", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-1",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 2 });
    scope.destroy();
  });

  it("P1-S1 never-fetched static + external invalidate does not network", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-s1",
      fetchFn: deferred.fetchFn,
    });

    const mutation = createBaseMutation<unknown, void>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/p1-s1"],
    });

    await mutation.mutate();
    expect(deferred.callCount()).toBe(0);

    scope.destroy();
  });

  it("P1-S1b never-fetched static + query.invalidate does not network", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-s1b",
      fetchFn: deferred.fetchFn,
    });

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(0);

    scope.destroy();
  });

  it("P1-S2 static after first fetch invoked + external invalidate auto-refreshes", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-s2",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    void scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await flushMicrotasks();

    const mutation = createBaseMutation<unknown, void>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/p1-s2"],
    });
    await mutation.mutate();

    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 2 });
    scope.destroy();
  });

  it("P1-S3 static first fetch failure still becomes eligible for auto-refetch", async () => {
    const sequential = createSequentialFetch([
      async () => {
        throw { message: "HTTP 500", status: 500 };
      },
      async () => jsonResponse({ ok: true }),
    ]);

    const scope = createQueryScope<{ ok: boolean }>({
      key: "/p1-s3",
      fetchFn: sequential.fetchFn,
    });

    await scope.query.fetch();
    expect(scope.query.error()).not.toBeNull();

    const mutation = createBaseMutation<unknown, void>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/p1-s3"],
    });
    await mutation.mutate();

    expect(sequential.callCount()).toBe(2);
    await flushMicrotasks();
    expect(scope.query.data()).toEqual({ ok: true });

    scope.destroy();
  });

  it("P1-A1 invalidate during inFlight starts one successor not join aborted", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/p1-a1",
      fetchFn: deferred.fetchFn,
    });

    void scope.query.fetch();
    expect(deferred.callCount()).toBe(1);

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);
    expect(cacheStore.get("/p1-a1")?.inFlight).toBeDefined();

    await deferred.resolvePending("fresh");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("fresh");
    scope.destroy();
  });

  it("P1-A2 two eligible observers + old inFlight → one successor", async () => {
    const deferred = createDeferredFetch();
    const [scopeA, scopeB] = createQueryScopes<string>("/p1-a2", 2, {
      fetchFn: deferred.fetchFn,
    });

    void scopeA.query.fetch();
    void scopeB.query.fetch();
    expect(deferred.callCount()).toBe(1);

    scopeA.query.invalidate();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending("shared");
    await flushMicrotasks();

    expect(scopeA.query.data()).toBe("shared");
    expect(scopeB.query.data()).toBe("shared");

    scopeA.destroy();
    scopeB.destroy();
  });

  it("P1-T1 ttl Infinity + invalidate triggers network", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-t1",
      options: { ttl: Infinity },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);

    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 2 });
    scope.destroy();
  });

  it("P1-5 mutation invalidateKeys refreshes eligible static query", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-5",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;

    const mutation = createBaseMutation<unknown, void>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/p1-5"],
    });
    await mutation.mutate();

    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 9 });
    await flushMicrotasks();

    expect(scope.query.data()).toEqual({ v: 9 });
    scope.destroy();
  });

  it("P1-E1 mutation success + auto-refetch failure — no unhandled rejection", async () => {
    const rejections: unknown[] = [];
    const onRejection = (event: Event) => {
      rejections.push((event as PromiseRejectionEvent).reason);
    };
    globalThis.addEventListener("unhandledrejection", onRejection);

    try {
      const sequential = createSequentialFetch([
        async () => jsonResponse({ v: 1 }),
        async () => {
          throw { message: "HTTP 503", status: 503 };
        },
      ]);

      const scope = createQueryScope<{ v: number }>({
        key: "/p1-e1",
        fetchFn: sequential.fetchFn,
      });

      const first = scope.query.fetch();
      await first;
      await flushMicrotasks();

      const mutation = createBaseMutation<unknown, void>({
        mutationFn: async () => ({}),
        invalidateKeys: ["/p1-e1"],
      });

      await mutation.mutate();
      await flushMicrotasks();
      await flushMicrotasks();

      expect(mutation.isSuccess()).toBe(true);
      expect(scope.query.error()?.status).toBe(503);
      expect(rejections).toHaveLength(0);

      scope.destroy();
    } finally {
      globalThis.removeEventListener("unhandledrejection", onRejection);
    }
  });

  it("P1-R1 separate invalidations supersede prior refresh", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/p1-r1",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending("initial");
    await first;

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(2);

    scope.query.invalidate();
    expect(deferred.callCount()).toBe(3);

    await deferred.resolvePending("latest");
    await flushMicrotasks();

    expect(scope.query.data()).toBe("latest");
    scope.destroy();
  });

  it("P1-4 two eligible consumers one invalidation event — one transport", async () => {
    const deferred = createDeferredFetch();
    const [scopeA, scopeB] = createQueryScopes<{ v: number }>("/p1-4", 2, {
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const firstA = scopeA.query.fetch();
    const firstB = scopeB.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await firstA;
    await firstB;

    const mutation = createBaseMutation<unknown, void>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/p1-4"],
    });
    await mutation.mutate();

    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    expect(scopeA.query.data()).toEqual({ v: 2 });
    expect(scopeB.query.data()).toEqual({ v: 2 });

    scopeA.destroy();
    scopeB.destroy();
  });

  it("P1-21 mutation failure does not invalidate", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-21",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;
    const before = cacheStore.get("/p1-21")?.timestamp;

    const mutation = createBaseMutation<never, void>({
      mutationFn: async () => {
        throw { message: "fail" };
      },
      invalidateKeys: ["/p1-21"],
    });

    await expect(mutation.mutate()).rejects.toBeDefined();
    expect(deferred.callCount()).toBe(1);
    expect(cacheStore.get("/p1-21")?.timestamp).toBe(before);

    scope.destroy();
  });

  it("P1-23 cache write after fetch does not re-trigger invalidation", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/p1-23",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;

    scope.query.invalidate();
    await deferred.resolvePending({ v: 2 });
    await flushMicrotasks();

    expect(deferred.callCount()).toBe(2);
    scope.destroy();
  });
});

describe("createMutation invalidateKeys integration", () => {
  it("createMutation passes invalidateKeys through transport", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ v: number }>({
      key: "/api/compat",
      options: { ttl: 60_000 },
      fetchFn: deferred.fetchFn,
    });

    const first = scope.query.fetch();
    await deferred.resolvePending({ v: 1 });
    await first;

    const mutation = createMutation<{ ok: boolean }, void>(
      "/api/compat",
      { invalidateKeys: ["/api/compat"] },
      (async () => jsonResponse({ ok: true })) as typeof fetch
    );

    await mutation.mutate();
    expect(deferred.callCount()).toBe(2);

    scope.destroy();
  });
});
