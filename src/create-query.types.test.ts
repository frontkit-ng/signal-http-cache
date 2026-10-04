import { describe, expect, it } from "vitest";
import type { LoaderQueryOptions } from "./internal/loader-query-options";
import type { QueryLoaderParams } from "./types";

describe("createQuery loader/fetch types", () => {
  it("QueryLoaderParams uses abortSignal", () => {
    type Params = QueryLoaderParams;
    type HasAbortSignal = Params extends { abortSignal: AbortSignal }
      ? true
      : false;
    type HasSignalAlias = Params extends { signal: AbortSignal } ? true : false;
    const abort: HasAbortSignal = true;
    const noSignalAlias: HasSignalAlias = false;
    expect(abort).toBe(true);
    expect(noSignalAlias).toBe(false);
  });

  it("LoaderQueryOptions only allows library fields besides loader", () => {
    type LibraryOnly = keyof Omit<LoaderQueryOptions<unknown>, "loader">;
    type Allowed = LibraryOnly extends "ttl" | "staleWhileRevalidate" ? true : false;
    const allowed: Allowed = true;
    expect(allowed).toBe(true);
  });
});
