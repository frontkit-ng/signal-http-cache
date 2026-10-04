import type { QueryFetchInit } from "../types";

const REJECTED_INIT_KEYS: Array<keyof QueryFetchInit> = [
  "cache",
  "mode",
  "redirect",
  "referrer",
  "referrerPolicy",
  "integrity",
  "keepalive",
  "priority",
];

export function assertHttpClientCompatibleInit(init: QueryFetchInit): void {
  if (init.signal !== undefined) {
    throw new Error(
      "Query fetch options cannot include `signal` when using HttpClient query transport; abort is managed by the query."
    );
  }

  if (init.credentials === "omit") {
    throw new Error(
      'Query fetch option credentials: "omit" is not supported on HttpClient query transport.'
    );
  }

  for (const key of REJECTED_INIT_KEYS) {
    if (init[key] !== undefined) {
      throw new Error(
        `Query fetch option \`${String(key)}\` is not supported on HttpClient query transport.`
      );
    }
  }

  if ("window" in init && (init as RequestInit).window !== undefined) {
    throw new Error(
      "Query fetch option `window` is not supported on HttpClient query transport."
    );
  }
}

export function resolveHttpClientCredentials(
  credentials: RequestCredentials | undefined
): { withCredentials?: boolean } {
  if (credentials === undefined) {
    return {};
  }
  if (credentials === "include") {
    return { withCredentials: true };
  }
  if (credentials === "same-origin") {
    return {};
  }
  throw new Error(
    `Query fetch option credentials: "${credentials}" is not supported on HttpClient query transport.`
  );
}

