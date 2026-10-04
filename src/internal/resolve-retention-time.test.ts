import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETENTION_MS,
  MAX_RETENTION_MS,
  resolveRetentionTimeMs,
} from "./resolve-retention-time";

describe("resolveRetentionTimeMs", () => {
  it("defaults to 60 seconds", () => {
    expect(resolveRetentionTimeMs()).toBe(DEFAULT_RETENTION_MS);
    expect(resolveRetentionTimeMs(undefined)).toBe(DEFAULT_RETENTION_MS);
  });

  it("accepts 0 and custom values", () => {
    expect(resolveRetentionTimeMs(0)).toBe(0);
    expect(resolveRetentionTimeMs(5_000)).toBe(5_000);
    expect(resolveRetentionTimeMs(MAX_RETENTION_MS)).toBe(MAX_RETENTION_MS);
  });

  it("rejects invalid values", () => {
    expect(() => resolveRetentionTimeMs(-1)).toThrow();
    expect(() => resolveRetentionTimeMs(Number.NaN)).toThrow();
    expect(() => resolveRetentionTimeMs(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => resolveRetentionTimeMs(Number.NEGATIVE_INFINITY)).toThrow();
    expect(() => resolveRetentionTimeMs(MAX_RETENTION_MS + 1)).toThrow(
      String(MAX_RETENTION_MS)
    );
  });
});
