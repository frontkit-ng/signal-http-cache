import { describe, expect, it } from "vitest";
import { createQueryScope } from "./test-support/angular-context";
import { createDeferredFetch } from "./test-support/fetch-mock";

describe("createQuery transport options", () => {
  it("passes RequestInit fields to fetchFn without library options", async () => {
    const deferred = createDeferredFetch();
    const scope = createQueryScope<{ ok: boolean }>({
      key: "/transport",
      options: {
        ttl: 60_000,
        staleWhileRevalidate: true,
        headers: { "X-Custom": "yes" },
        credentials: "include",
        cache: "no-cache",
      },
      fetchFn: deferred.fetchFn,
    });

    const fetchPromise = scope.query.fetch();
    expect(deferred.callCount()).toBe(1);

    const init = deferred.getLastInit();
    expect(init).toBeDefined();
    expect(init).toMatchObject({
      method: "GET",
      headers: { "X-Custom": "yes" },
      credentials: "include",
      cache: "no-cache",
    });
    expect(init).not.toHaveProperty("ttl");
    expect(init).not.toHaveProperty("staleWhileRevalidate");

    await deferred.resolvePending({ ok: true });
    await fetchPromise;

    scope.destroy();
  });
});
