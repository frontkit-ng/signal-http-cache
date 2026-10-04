import { describe, expect, it, vi } from "vitest";
import { runQueryLoader } from "./query-loader";
import type { QueryLoaderParams } from "./types";

const params = (signal?: AbortSignal): QueryLoaderParams => ({
  key: "/loader",
  abortSignal: signal ?? new AbortController().signal,
});

describe("runQueryLoader", () => {
  it("resolves promise loaders", async () => {
    const value = await runQueryLoader(async () => "ok", params());
    expect(value).toBe("ok");
  });

  it("resolves synchronous subscribable first emission and unsubscribes", async () => {
    const unsubscribe = vi.fn();
    let nextCalls = 0;

    const value = await runQueryLoader(
      () => ({
        subscribe: ({ next }) => {
          next?.("sync");
          nextCalls++;
          return { unsubscribe };
        },
      }),
      params()
    );

    expect(value).toBe("sync");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(nextCalls).toBe(1);
  });

  it("rejects complete without value", async () => {
    await expect(
      runQueryLoader(
        () => ({
          subscribe: ({ complete }) => {
            complete?.();
            return { unsubscribe: () => undefined };
          },
        }),
        params()
      )
    ).rejects.toThrow(/without emitting/);
  });

  it("rejects when aborted before subscribe", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runQueryLoader(async () => "nope", params(controller.signal))
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes abortSignal to loader params", async () => {
    const controller = new AbortController();
    await runQueryLoader(async ({ abortSignal }) => {
      expect(abortSignal).toBe(controller.signal);
      return true;
    }, params(controller.signal));
  });

  it("rejects synchronous loader errors", async () => {
    await expect(
      runQueryLoader(() => {
        throw new Error("sync loader");
      }, params())
    ).rejects.toThrow(/sync loader/);
  });

  it("resolves sync next before complete on subscribable loaders", async () => {
    const value = await runQueryLoader(
      () => ({
        subscribe: ({ next, complete }) => {
          next?.("value");
          complete?.();
          return { unsubscribe: () => undefined };
        },
      }),
      params()
    );
    expect(value).toBe("value");
  });

  it("rejects when aborted after subscribe begins", async () => {
    const controller = new AbortController();
    const pending = runQueryLoader(
      () => ({
        subscribe: () => {
          controller.abort();
          return { unsubscribe: () => undefined };
        },
      }),
      params(controller.signal)
    );
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects when subscribe throws synchronously", async () => {
    await expect(
      runQueryLoader(
        () => ({
          subscribe: () => {
            throw new Error("subscribe blew up");
          },
        }),
        params()
      )
    ).rejects.toThrow(/subscribe blew up/);
  });

  it("ignores non-cooperative promise resolution after abort", async () => {
    const controller = new AbortController();
    const pending = runQueryLoader(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("late"), 0);
        }),
      params(controller.signal)
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
