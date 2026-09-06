import { describe, expect, it } from "vitest";
import type { Signal } from "@angular/core";
import type { QueryKey } from "./types";
import { createReactiveQuery } from "./create-reactive-query";

type ReactiveQueryKeyParam = Parameters<typeof createReactiveQuery>[0];

type LegacyKeyAccepted = Signal<QueryKey> extends ReactiveQueryKeyParam
  ? true
  : false;
type InactiveKeyAccepted = Signal<QueryKey | undefined> extends ReactiveQueryKeyParam
  ? true
  : false;

type AssertLegacy = LegacyKeyAccepted extends true
  ? true
  : "Signal<QueryKey> must be accepted by createReactiveQuery";
type AssertInactive = InactiveKeyAccepted extends true
  ? true
  : "Signal<QueryKey | undefined> must be accepted by createReactiveQuery";

const legacyAccepted: AssertLegacy = true;
const inactiveAccepted: AssertInactive = true;

describe("createReactiveQuery type compatibility", () => {
  it("accepts Signal<QueryKey> and Signal<QueryKey | undefined> at compile time", () => {
    expect(legacyAccepted).toBe(true);
    expect(inactiveAccepted).toBe(true);
  });
});
