export function jsonResponse(data: unknown, ok = true, status = 200): Response {
  const body = JSON.stringify(data);
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(data),
  } as Response;
}

export type DeferredFetch = {
  fetchFn: typeof fetch;
  callCount: () => number;
  resolvePending: (data: unknown) => Promise<void>;
  rejectPending: (error: unknown) => Promise<void>;
  resolvePendingWithResponse: (response: Response) => Promise<void>;
  getLastSignal: () => AbortSignal | undefined;
};

export function createDeferredFetch(): DeferredFetch {
  let pendingResolve: ((response: Response) => void) | null = null;
  let pendingReject: ((error: unknown) => void) | null = null;
  let count = 0;
  let lastSignal: AbortSignal | undefined;

  const fetchFn = (async (_url: string, init?: RequestInit) => {
    count++;
    lastSignal = init?.signal ?? undefined;

    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    return new Promise<Response>((resolve, reject) => {
      pendingResolve = resolve;
      pendingReject = reject;

      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
  }) as typeof fetch;

  async function settle(
    settleFn: (() => void) | null,
    cleanup = true
  ): Promise<void> {
    settleFn?.();
    if (cleanup) {
      pendingResolve = null;
      pendingReject = null;
    }
    await Promise.resolve();
  }

  return {
    fetchFn,
    callCount: () => count,
    resolvePending: async (data: unknown) => {
      await settle(() => pendingResolve?.(jsonResponse(data)));
    },
    rejectPending: async (error: unknown) => {
      await settle(() => pendingReject?.(error));
    },
    resolvePendingWithResponse: async (response: Response) => {
      await settle(() => pendingResolve?.(response));
    },
    getLastSignal: () => lastSignal,
  };
}

export function createSequentialFetch(
  handlers: Array<(call: number, init?: RequestInit) => Promise<Response>>
): { fetchFn: typeof fetch; callCount: () => number } {
  let count = 0;

  const fetchFn = (async (_url: string, init?: RequestInit) => {
    count++;
    const handler = handlers[count - 1];
    if (!handler) {
      throw new Error(`No handler for fetch call #${count}`);
    }
    return handler(count, init);
  }) as typeof fetch;

  return { fetchFn, callCount: () => count };
}

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
