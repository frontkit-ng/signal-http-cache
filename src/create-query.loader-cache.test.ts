import { describe, expect, it } from "vitest";
import { cacheStore } from "./cache-store";
import { createQueryScope } from "./test-support/angular-context";

describe("loader transport cache integration", () => {
  it("deduplicates in-flight loader work for the same key", async () => {
    let runs = 0;
    let resolveLoader: ((value: number) => void) | undefined;

    const scopeA = createQueryScope<number>({
      key: "/loader-dedup",
      options: {
        loader: () =>
          new Promise<number>((resolve) => {
            runs++;
            resolveLoader = resolve;
          }),
      },
    });
    const scopeB = createQueryScope<number>({
      key: "/loader-dedup",
      options: {
        loader: () =>
          new Promise<number>((resolve) => {
            runs++;
            resolveLoader = resolve;
          }),
      },
    });

    const first = scopeA.query.fetch();
    const second = scopeB.query.fetch();
    expect(runs).toBe(1);

    resolveLoader?.(7);
    await Promise.all([first, second]);

    expect(scopeA.query.data()).toBe(7);
    expect(scopeB.query.data()).toBe(7);
    expect(cacheStore.get("/loader-dedup")?.inFlight).toBeUndefined();

    scopeA.destroy();
    scopeB.destroy();
  });

  it("invalidate triggers a new loader execution", async () => {
    let runs = 0;
    const scope = createQueryScope<number>({
      key: "/loader-invalidate",
      options: {
        ttl: 60_000,
        loader: async () => {
          runs++;
          return runs;
        },
      },
    });

    await scope.query.fetch();
    expect(scope.query.data()).toBe(1);

    scope.query.invalidate();
    await scope.query.fetch();
    expect(runs).toBe(2);
    expect(scope.query.data()).toBe(2);

    scope.destroy();
  });

});
