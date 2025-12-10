import { signal, computed } from "@angular/core";
import { cacheStore } from "./cache-store";
import {
  HttpMutation,
  HttpQueryError,
  MutationOptions,
  MutationStatus,
  QueryKey,
} from "./types";
import { sleep, toHttpQueryError } from "./utils";

function resolveRetryDelay(
  retryDelay: number | ((attempt: number) => number) | undefined,
  attempt: number
): number {
  if (typeof retryDelay === "function") {
    return retryDelay(attempt);
  }
  return retryDelay ?? 1000;
}

function invalidateQueryKeys(keys: QueryKey[]): void {
  for (const key of keys) {
    const cacheKey = typeof key === "string" ? key : JSON.stringify(key);
    const entry = cacheStore.get(cacheKey);
    if (entry) {
      entry.abortController?.abort();
      entry.timestamp = 0;
    }
  }
}

export function createBaseMutation<TData, TVariables, TContext = unknown>(
  options: MutationOptions<TData, TVariables, TContext>
): HttpMutation<TData, TVariables> {
  const {
    mutationFn,
    onMutate,
    onSuccess,
    onError,
    onFinally,
    invalidateKeys,
    retry = 0,
    retryDelay = 1000,
  } = options;

  const data = signal<TData | null>(null);
  const error = signal<HttpQueryError | null>(null);
  const status = signal<MutationStatus>("idle");

  const isIdle = computed(() => status() === "idle");
  const isPending = computed(() => status() === "pending");
  const isSuccess = computed(() => status() === "success");
  const isError = computed(() => status() === "error");

  async function executeMutation(variables: TVariables): Promise<TData> {
    let context: TContext | undefined;
    let attempt = 0;

    error.set(null);
    status.set("pending");

    try {
      if (onMutate) {
        context = await onMutate(variables);
      }

      // retry loop
      while (true) {
        try {
          const result = await mutationFn(variables);

          data.set(result);
          status.set("success");

          if (invalidateKeys?.length) {
            invalidateQueryKeys(invalidateKeys);
          }

          if (onSuccess) {
            await onSuccess(result, variables, context);
          }

          if (onFinally) {
            await onFinally(result, null, variables, context);
          }

          return result;
        } catch (err) {
          attempt++;

          // wait and retry
          if (attempt <= retry) {
            const delay = resolveRetryDelay(retryDelay, attempt);
            await sleep(delay);
            continue;
          }

          // no more retries
          throw err;
        }
      }
    } catch (err) {
      const httpError = toHttpQueryError(err, "Mutation failed");
      error.set(httpError);
      status.set("error");

      if (onError) {
        await onError(httpError, variables, context);
      }

      if (onFinally) {
        await onFinally(null, httpError, variables, context);
      }

      throw httpError;
    }
  }

  function reset(): void {
    data.set(null);
    error.set(null);
    status.set("idle");
  }

  return {
    data: data.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    isIdle,
    isPending,
    isSuccess,
    isError,
    mutate: executeMutation,
    reset,
  };
}
