import { describe, expect, it } from "vitest";
import * as publicApi from "./index";
import { createQueryScope } from "./test-support/angular-context";

// @ts-expect-error CacheEntry is intentionally internal and must not be exported.
import type { CacheEntry } from "./index";

describe("public API boundary", () => {
  it("does not export cacheStore", () => {
    expect("cacheStore" in publicApi).toBe(false);
  });

  it("exports createReactiveQuery", () => {
    expect(typeof publicApi.createReactiveQuery).toBe("function");
  });
});

describe("HttpQuery surface", () => {
  it("includes loading, isLoading, and isFetching on queries created via createQuery", () => {
    const scope = createQueryScope<string>({ key: "/api" });
    expect(typeof scope.query.loading).toBe("function");
    expect(scope.query.loading()).toBe(false);
    expect(typeof scope.query.isLoading).toBe("function");
    expect(scope.query.isLoading()).toBe(false);
    expect(typeof scope.query.isFetching).toBe("function");
    expect(scope.query.isFetching()).toBe(false);
    scope.destroy();
  });
});
