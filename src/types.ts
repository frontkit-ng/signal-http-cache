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

export type QueryLibraryOptions = {
  ttl?: number;
  staleWhileRevalidate?: boolean;
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
  library: Required<QueryLibraryOptions>;
  fetchInit: QueryFetchInit;
} {
  const { ttl, staleWhileRevalidate, ...fetchInit } = options;
  return {
    library: {
      ttl: ttl ?? 0,
      staleWhileRevalidate: staleWhileRevalidate ?? false,
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
