import { Signal } from "@angular/core";

export type QueryKey = string | readonly [string, ...unknown[]];
export interface HttpQueryError {
  message: string;
  status?: number;
  statusText?: string;
  cause?: unknown;
}
export interface HttpQuery<T> {
  data: Signal<T | null>;
  /**
   * @deprecated Use `isLoading` for blocking loading UI or `isFetching` for active
   * request participation. Behavior differs from both; not a drop-in alias.
   * Planned for removal in 1.0.0.
   */
  loading: Signal<boolean>;
  isLoading: Signal<boolean>;
  isFetching: Signal<boolean>;
  error: Signal<HttpQueryError | null>;
  fetch(force?: boolean): Promise<void>;
  invalidate(): void;
}

export type SplitQueryLibraryOptions = {
  ttl: number;
  staleWhileRevalidate: boolean;
  retentionTime?: number;
};

export type QueryLibraryOptions = {
  ttl?: number;
  staleWhileRevalidate?: boolean;
  /**
   * How long settled cache data for this query key may remain in memory after the
   * last live query consumer is destroyed. Milliseconds. Defaults to 60 seconds.
   * Use `0` for immediate removal (previous behavior).
   *
   * Must be a finite non-negative number (not NaN or ±Infinity) and must not exceed
   * the maximum delay supported by the runtime timer API (approximately 24.8 days).
   * Values above that limit throw synchronously when the query is created.
   *
   * Does not keep network requests running after the final consumer is destroyed.
   * `ttl` controls freshness while a cache entry exists;
   * `retentionTime` controls how long unused settled data may remain after that.
   */
  retentionTime?: number;
};

export type QueryFetchInit = Omit<RequestInit, "method" | "body">;

export type QueryOptions = QueryLibraryOptions & QueryFetchInit;

export interface QueryLoaderParams {
  key: QueryKey;
  abortSignal: AbortSignal;
}

export type QueryLoader<T> = (
  params: QueryLoaderParams
) =>
  | Promise<T>
  | {
      subscribe(observer: {
        next?: (value: T) => void;
        error?: (err: unknown) => void;
        complete?: () => void;
      }): { unsubscribe(): void };
    };

export function splitQueryOptions(
  options: Omit<QueryOptions, "method"> = {}
): {
  library: SplitQueryLibraryOptions;
  fetchInit: QueryFetchInit;
} {
  const { ttl, staleWhileRevalidate, retentionTime, ...fetchInit } = options;
  return {
    library: {
      ttl: ttl ?? 0,
      staleWhileRevalidate: staleWhileRevalidate ?? false,
      retentionTime,
    },
    fetchInit,
  };
}

export type MutationStatus = "idle" | "pending" | "success" | "error";

export interface MutationOptions<TData, TVariables, TContext = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => TContext | Promise<TContext>;
  onSuccess?: (
    data: TData,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
  onError?: (
    error: HttpQueryError,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
  onFinally?: (
    data: TData | null,
    error: HttpQueryError | null,
    variables: TVariables,
    context: TContext | undefined
  ) => void | Promise<void>;
  invalidateKeys?: QueryKey[];
  retry?: number;
  retryDelay?: number | ((attempt: number) => number);
}

export interface HttpMutation<TData, TVariables> {
  data: Signal<TData | null>;
  error: Signal<HttpQueryError | null>;
  status: Signal<MutationStatus>;
  isIdle: Signal<boolean>;
  isPending: Signal<boolean>;
  isSuccess: Signal<boolean>;
  isError: Signal<boolean>;
  mutate(variables: TVariables): Promise<TData>;
  reset(): void;
}

export interface HttpMutationOptions extends Omit<RequestInit, "body"> {
  onSuccess?: () => void;
  onError?: (error: HttpQueryError) => void;
  onFinally?: () => void;
  invalidateKeys?: QueryKey[];
  retry?: number;
  retryDelay?: number | ((attempt: number) => number);
}
