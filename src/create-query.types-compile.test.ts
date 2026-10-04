/**
 * Compile-only checks (vitest still typechecks this file via test:typecheck).
 */
import { createQuery } from "./create-query";
import type { QueryKey } from "./types";

const key: QueryKey = "/exclusive";

// @ts-expect-error loader and fetchFn are mutually exclusive
createQuery(key, { loader: async () => null }, fetch);

// @ts-expect-error loader options must not include fetch RequestInit fields
createQuery(key, {
  loader: async () => null,
  credentials: "include",
});
