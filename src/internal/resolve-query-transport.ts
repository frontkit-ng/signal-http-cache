import { inject } from "@angular/core";
import { createFetchQueryExecutor } from "./fetch-query-executor";
import type { QueryHttpExecutor } from "./http-transport-types";
import { QUERY_HTTP_EXECUTOR } from "./query-http-executor-token";

export type ResolveQueryTransportInput = {
  explicitFetchFn: boolean;
  fetchFn?: typeof fetch;
};

export function resolveQueryHttpExecutor(
  input: ResolveQueryTransportInput
): QueryHttpExecutor {
  if (input.explicitFetchFn) {
    const fn = input.fetchFn ?? fetch;
    return createFetchQueryExecutor(fn);
  }

  const injected = inject(QUERY_HTTP_EXECUTOR, { optional: true });
  if (injected) {
    return injected;
  }

  return createFetchQueryExecutor(fetch);
}
