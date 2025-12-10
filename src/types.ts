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
  loading: Signal<boolean>;
  error: Signal<HttpQueryError | null>;
  fetch(force?: boolean): Promise<void>;
  invalidate(): void;
}

export interface QueryOptions extends Omit<RequestInit, "method" | "body"> {
  ttl?: number;
  staleWhileRevalidate?: boolean;
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
