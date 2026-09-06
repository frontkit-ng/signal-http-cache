import { describe, expect, it } from "vitest";
import { cacheStore } from "./cache-store";
import {
  createReactiveQueryScope,
  flushReactiveEffects,
  signal,
} from "./test-support/angular-context";
import {
  createDeferredFetch,
  flushMicrotasks,
} from "./test-support/fetch-mock";

describe("createReactiveQuery consumer ownership", () => {
  it("R14. destroy after transitions releases active key", async () => {
    const key = signal<"/r14-a" | "/r14-b">("/r14-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    expect(cacheStore.getConsumerCount("/r14-a")).toBe(1);

    key.set("/r14-b");
    flushReactiveEffects();
    await deferred.resolvePending("B");
    await flushMicrotasks();

    expect(cacheStore.getConsumerCount("/r14-a")).toBe(0);
    expect(cacheStore.getConsumerCount("/r14-b")).toBe(1);

    scope.destroy();
    expect(cacheStore.getConsumerCount("/r14-b")).toBe(0);
    expect(cacheStore.has("/r14-b")).toBe(false);
  });

  it("R12 ownership: coalesced B never registers consumer", async () => {
    const key = signal<"/own-a" | "/own-b" | "/own-c">("/own-a");
    const deferred = createDeferredFetch();
    const scope = createReactiveQueryScope<string>({
      key,
      fetchFn: deferred.fetchFn,
    });

    await deferred.resolvePending("A");
    await flushMicrotasks();

    key.set("/own-b");
    key.set("/own-c");
    flushReactiveEffects();

    expect(cacheStore.getConsumerCount("/own-b")).toBe(0);
    expect(cacheStore.getConsumerCount("/own-c")).toBe(1);

    await deferred.resolvePending("C");
    await flushMicrotasks();
    scope.destroy();
  });
});
