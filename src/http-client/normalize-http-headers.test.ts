import { HttpHeaders } from "@angular/common/http";
import { describe, expect, it } from "vitest";
import { normalizeHeadersForHttpClient } from "./normalize-http-headers";

describe("normalizeHeadersForHttpClient", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizeHeadersForHttpClient(undefined)).toBeUndefined();
  });

  it("passes through HttpHeaders instances", () => {
    const headers = new HttpHeaders({ A: "b" });
    expect(normalizeHeadersForHttpClient(headers)).toBe(headers);
  });

  it("normalizes record headers", () => {
    const headers = normalizeHeadersForHttpClient({ A: "b" });
    expect(headers?.get("a")).toBe("b");
  });

  it("normalizes Headers instance with append semantics", () => {
    const fetchHeaders = new Headers({ "X-Test": "1" });
    const headers = normalizeHeadersForHttpClient(fetchHeaders);
    expect(headers?.get("x-test")).toBe("1");
  });

  it("normalizes header tuple array", () => {
    const headers = normalizeHeadersForHttpClient([["X-Test", "value"]]);
    expect(headers?.get("x-test")).toBe("value");
  });

  it("preserves repeated tuple header names via append", () => {
    const headers = normalizeHeadersForHttpClient([
      ["X-Multi", "a"],
      ["X-Multi", "b"],
    ]);
    expect(headers?.getAll("x-multi")).toEqual(["a", "b"]);
  });
});
