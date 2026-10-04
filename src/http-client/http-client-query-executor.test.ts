import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "@angular/common/http";
import { createHttpClientQueryExecutor } from "./http-client-query-executor";

type MockHandlers = {
  next?: (observer: {
    next: (value: unknown) => void;
    error: (err: unknown) => void;
  }) => void;
  subscribeThrows?: boolean;
};

function createMockHttpClient(handlers: MockHandlers): HttpClient {
  return {
    get: () => ({
      subscribe: (observer: {
        next?: (value: unknown) => void;
        error?: (err: unknown) => void;
      }) => {
        if (handlers.subscribeThrows) {
          throw new Error("subscribe failed");
        }
        handlers.next?.({
          next: (value) => observer.next?.(value),
          error: (err) => observer.error?.(err),
        });
        return {
          unsubscribe: vi.fn(),
        };
      },
    }),
  } as unknown as HttpClient;
}

describe("createHttpClientQueryExecutor teardown", () => {
  it("cleans up abort listener and subscription on success", async () => {
    const unsubscribe = vi.fn();
    const signal = new AbortController().signal;
    const addListener = vi.spyOn(signal, "addEventListener");
    const removeListener = vi.spyOn(signal, "removeEventListener");

    const http = {
      get: () => ({
        subscribe: (observer: { next?: (value: unknown) => void }) => {
          observer.next?.({
            status: 200,
            statusText: "OK",
            body: "{}",
          });
          return { unsubscribe };
        },
      }),
    } as unknown as HttpClient;

    const executor = createHttpClientQueryExecutor(http);
    const result = await executor({
      url: "/ok",
      init: {},
      signal,
    });

    expect(result.ok).toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(addListener.mock.calls.length).toBe(removeListener.mock.calls.length);

    addListener.mockRestore();
    removeListener.mockRestore();
  });

  it("cleans up on HTTP failure resolved through next", async () => {
    const unsubscribe = vi.fn();
    const signal = new AbortController().signal;

    const http = {
      get: () => ({
        subscribe: (observer: { next?: (value: unknown) => void }) => {
          observer.next?.({
            status: 404,
            statusText: "Not Found",
            body: "",
          });
          return { unsubscribe };
        },
      }),
    } as unknown as HttpClient;

    const executor = createHttpClientQueryExecutor(http);
    const result = await executor({ url: "/missing", init: {}, signal });
    expect(result.ok).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cleans up on network HttpErrorResponse error", async () => {
    const unsubscribe = vi.fn();
    const signal = new AbortController().signal;

    const http = {
      get: () => ({
        subscribe: (observer: { error?: (err: unknown) => void }) => {
          observer.error?.({
            status: 0,
            statusText: "Unknown Error",
            error: "network",
          });
          return { unsubscribe };
        },
      }),
    } as unknown as HttpClient;

    const executor = createHttpClientQueryExecutor(http);
    const result = await executor({ url: "/net", init: {}, signal });
    expect(result.ok).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cleans up on abort before response", async () => {
    const unsubscribe = vi.fn();
    const controller = new AbortController();
    const signal = controller.signal;

    const http = {
      get: () => ({
        subscribe: () => ({ unsubscribe }),
      }),
    } as unknown as HttpClient;

    const executor = createHttpClientQueryExecutor(http);
    const pending = executor({ url: "/abort", init: {}, signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("cleans up when subscribe throws synchronously", async () => {
    const signal = new AbortController().signal;
    const removeListener = vi.spyOn(signal, "removeEventListener");

    const http = createMockHttpClient({ subscribeThrows: true });
    const executor = createHttpClientQueryExecutor(http);

    await expect(
      executor({ url: "/sync-throw", init: {}, signal })
    ).rejects.toThrow(/subscribe failed/);

    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    removeListener.mockRestore();
  });

  it("does not invoke callbacks after terminal settlement", async () => {
    const signal = new AbortController().signal;
    let nextCalls = 0;

    const http = {
      get: () => ({
        subscribe: (observer: { next?: (value: unknown) => void }) => {
          observer.next?.({
            status: 200,
            statusText: "OK",
            body: "1",
          });
          observer.next?.({
            status: 200,
            statusText: "OK",
            body: "2",
          });
          nextCalls++;
          return { unsubscribe: vi.fn() };
        },
      }),
    } as unknown as HttpClient;

    const executor = createHttpClientQueryExecutor(http);
    const result = await executor({ url: "/once", init: {}, signal });
    expect(result.ok).toBe(true);
    expect((result as { bodyText: string }).bodyText).toBe("1");
    expect(nextCalls).toBe(1);
  });
});
