import type {
  QueryFetchInit,
  QueryLibraryOptions,
  QueryLoader,
  SplitQueryLibraryOptions,
} from "../types";

export type LoaderQueryOptions<T> = QueryLibraryOptions & {
  loader: QueryLoader<T>;
};

export type FetchQueryOptions = Omit<
  import("../types").QueryOptions,
  "method"
> & {
  loader?: never;
};

const FETCH_INIT_KEYS: Array<keyof QueryFetchInit> = [
  "cache",
  "credentials",
  "headers",
  "integrity",
  "keepalive",
  "mode",
  "priority",
  "redirect",
  "referrer",
  "referrerPolicy",
  "signal",
];

function assertNoFetchInitOnLoaderOptions(options: Record<string, unknown>): void {
  for (const key of FETCH_INIT_KEYS) {
    if (options[key] !== undefined) {
      throw new Error(
        `Loader queries do not accept fetch transport option \`${String(key)}\`; use loader execution or fetch-query options instead.`
      );
    }
  }
  if ("window" in options && options.window !== undefined) {
    throw new Error(
      "Loader queries do not accept fetch transport option `window`; use loader execution or fetch-query options instead."
    );
  }
}

export function splitLoaderQueryOptions<T>(
  options: LoaderQueryOptions<T>
): {
  library: SplitQueryLibraryOptions;
  loader: QueryLoader<T>;
} {
  assertNoFetchInitOnLoaderOptions(options as Record<string, unknown>);
  const { ttl, staleWhileRevalidate, retentionTime, loader } = options;
  return {
    library: {
      ttl: ttl ?? 0,
      staleWhileRevalidate: staleWhileRevalidate ?? false,
      retentionTime,
    },
    loader,
  };
}
