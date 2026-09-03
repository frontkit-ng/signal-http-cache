import { describe, expect, it } from "vitest";
import { createQuery } from "./create-query";
import { cacheStore } from "./cache-store";
import {
  createDeferredFetch,
  flushMicrotasks,
} from "./test-support/fetch-mock";
import {
  createQueryScope,
  createQueryScopes,
} from "./test-support/angular-context";

describe("createQuery consumer ownership", () => {
  it("15. one consumer lifecycle registers and releases ownership", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/one-consumer",
      fetchFn: deferred.fetchFn,
    });

    expect(cacheStore.getConsumerCount("/one-consumer")).toBe(1);

    const fetchPromise = scope.query.fetch();
    await deferred.resolvePending("data");
    await fetchPromise;
    expect(cacheStore.has("/one-consumer")).toBe(true);

    scope.destroy();
    expect(cacheStore.getConsumerCount("/one-consumer")).toBe(0);
    expect(cacheStore.has("/one-consumer")).toBe(false);
  });

  it("16. multiple consumers before first fetch survive partial destruction", async () => {
    const deferred = createDeferredFetch();
    const [scopeA, scopeB] = createQueryScopes<string>("/prefetch", 2, {
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });

    expect(cacheStore.getConsumerCount("/prefetch")).toBe(2);

    const fetchPromise = scopeA.query.fetch();
    expect(deferred.callCount()).toBe(1);
    await deferred.resolvePending("shared");
    await fetchPromise;

    scopeA.destroy();
    expect(cacheStore.getConsumerCount("/prefetch")).toBe(1);
    expect(cacheStore.has("/prefetch")).toBe(true);

    await scopeB.query.fetch();
    expect(deferred.callCount()).toBe(1);
    expect(scopeB.query.data()).toBe("shared");

    scopeB.destroy();
    expect(cacheStore.getConsumerCount("/prefetch")).toBe(0);
    expect(cacheStore.has("/prefetch")).toBe(false);
  });

  it("17. consumer created after cache exists follows 1 to 2 to 1 to 0 lifecycle", async () => {
    const deferred = createDeferredFetch();
    const scopeA = createQueryScope<string>({
      key: "/after-cache",
      fetchFn: deferred.fetchFn,
    });

    const firstFetch = scopeA.query.fetch();
    await deferred.resolvePending("v1");
    await firstFetch;
    expect(cacheStore.getConsumerCount("/after-cache")).toBe(1);

    const scopeB = createQueryScope<string>({
      key: "/after-cache",
      fetchFn: deferred.fetchFn,
    });
    expect(cacheStore.getConsumerCount("/after-cache")).toBe(2);

    scopeA.destroy();
    expect(cacheStore.getConsumerCount("/after-cache")).toBe(1);
    expect(cacheStore.has("/after-cache")).toBe(true);

    scopeB.destroy();
    expect(cacheStore.getConsumerCount("/after-cache")).toBe(0);
    expect(cacheStore.has("/after-cache")).toBe(false);
  });

  it("18. three consumers support nontrivial destruction order B, A, C", async () => {
    const deferred = createDeferredFetch();
    const [scopeA, scopeB, scopeC] = createQueryScopes<string>("/three", 3, {
      fetchFn: deferred.fetchFn,
    });

    expect(cacheStore.getConsumerCount("/three")).toBe(3);

    const fetchPromise = scopeA.query.fetch();
    await deferred.resolvePending("data");
    await fetchPromise;

    scopeB.destroy();
    expect(cacheStore.getConsumerCount("/three")).toBe(2);
    expect(cacheStore.has("/three")).toBe(true);

    scopeA.destroy();
    expect(cacheStore.getConsumerCount("/three")).toBe(1);

    scopeC.destroy();
    expect(cacheStore.getConsumerCount("/three")).toBe(0);
    expect(cacheStore.has("/three")).toBe(false);
  });

  it("19. query created but never fetched cleans ownership without cache entry", () => {
    const scope = createQueryScope<string>({ key: "/never-fetched" });

    expect(cacheStore.getConsumerCount("/never-fetched")).toBe(1);
    expect(cacheStore.has("/never-fetched")).toBe(false);

    scope.destroy();

    expect(cacheStore.getConsumerCount("/never-fetched")).toBe(0);
    expect(cacheStore.has("/never-fetched")).toBe(false);
  });

  it("20. failed construction outside injection context does not register consumer", () => {
    expect(() => createQuery("/no-context")).toThrow();

    expect(cacheStore.getConsumerCount("/no-context")).toBe(0);
    expect(cacheStore.has("/no-context")).toBe(false);
  });

  it("22. invalidation while multiple consumers remain preserves ownership", async () => {
    const deferred = createDeferredFetch();
    const [scopeA, scopeB] = createQueryScopes<string>("/inv-owners", 2, {
      fetchFn: deferred.fetchFn,
      options: { ttl: 60_000 },
    });

    const firstFetch = scopeA.query.fetch();
    await deferred.resolvePending("cached");
    await firstFetch;

    scopeA.query.invalidate();

    expect(cacheStore.getConsumerCount("/inv-owners")).toBe(2);
    expect(cacheStore.has("/inv-owners")).toBe(true);

    scopeA.destroy();
    expect(cacheStore.getConsumerCount("/inv-owners")).toBe(1);
    expect(cacheStore.has("/inv-owners")).toBe(true);

    const refetch = scopeB.query.fetch();
    expect(deferred.callCount()).toBe(2);
    await deferred.resolvePending("fresh");
    await refetch;

    scopeB.destroy();
    expect(cacheStore.getConsumerCount("/inv-owners")).toBe(0);
  });

  it("last consumer destroy aborts active in-flight request", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<string>({
      key: "/abort-on-last",
      fetchFn: deferred.fetchFn,
    });

    const inFlight = scope.query.fetch();
    expect(deferred.getLastSignal()?.aborted).toBe(false);

    scope.destroy();
    await inFlight;
    await flushMicrotasks();

    expect(deferred.getLastSignal()?.aborted).toBe(true);
    expect(cacheStore.has("/abort-on-last")).toBe(false);
  });
});
