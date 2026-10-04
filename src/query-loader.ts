import type { QueryLoader, QueryLoaderParams } from "./types";

type SubscribableLike<T> = {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
};

function isSubscribableLike<T>(value: unknown): value is SubscribableLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribe" in value &&
    typeof (value as SubscribableLike<T>).subscribe === "function"
  );
}

export function runQueryLoader<T>(
  loader: QueryLoader<T>,
  params: QueryLoaderParams
): Promise<T> {
  const { abortSignal } = params;

  if (abortSignal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let subscription: { unsubscribe(): void } | undefined;

    const cleanup = (): void => {
      abortSignal.removeEventListener("abort", onAbortListener);
      subscription?.unsubscribe();
      subscription = undefined;
    };

    const settleResolve = (value: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (reason: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(reason);
    };

    const onAbortListener = (): void => {
      settleReject(new DOMException("Aborted", "AbortError"));
    };

    abortSignal.addEventListener("abort", onAbortListener);

    try {
      const result = loader(params);

      if (isSubscribableLike<T>(result)) {
        subscription = result.subscribe({
          next: (value) => settleResolve(value),
          error: (err) => settleReject(err),
          complete: () =>
            settleReject(
              new Error("Query loader completed without emitting a value")
            ),
        });

        if (settled) {
          subscription?.unsubscribe();
          subscription = undefined;
        }

        if (abortSignal.aborted) {
          onAbortListener();
        }
        return;
      }

      void Promise.resolve(result).then(settleResolve, settleReject);
      if (abortSignal.aborted) {
        onAbortListener();
      }
    } catch (err) {
      settleReject(err);
    }
  });
}
