import { describe, expect, it } from "vitest";
import {
  assertHttpClientCompatibleInit,
  resolveHttpClientCredentials,
} from "./internal/http-client-query-init";

describe("HttpClient query init mapping", () => {
  it("maps credentials include to withCredentials", () => {
    expect(resolveHttpClientCredentials("include")).toEqual({
      withCredentials: true,
    });
  });

  it("maps credentials same-origin to default", () => {
    expect(resolveHttpClientCredentials("same-origin")).toEqual({});
  });

  it("rejects credentials omit", () => {
    expect(() => resolveHttpClientCredentials("omit")).toThrow(/omit/);
  });

  it("rejects cache on HttpClient path", () => {
    expect(() =>
      assertHttpClientCompatibleInit({ cache: "no-cache" })
    ).toThrow(/cache/);
  });

  it("rejects explicit consumer signal", () => {
    expect(() =>
      assertHttpClientCompatibleInit({
        signal: new AbortController().signal,
      })
    ).toThrow(/signal/);
  });

});
