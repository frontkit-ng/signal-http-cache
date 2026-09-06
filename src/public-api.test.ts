import { describe, expect, it } from "vitest";
import * as publicApi from "./index";

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
