import { describe, expect, it } from "vitest";
import { createQueryScope } from "./test-support/angular-context";
import { flushMicrotasks } from "./test-support/fetch-mock";

describe("createQuery loader transport", () => {
  it("loader resolves data without fetch", async () => {
    const scope = createQueryScope<{ ok: boolean }>({
      key: "/loader",
      options: {
        loader: async ({ key, abortSignal }) => {
          expect(key).toBe("/loader");
          expect(abortSignal).toBeInstanceOf(AbortSignal);
          return { ok: true };
        },
      },
    });

    await scope.query.fetch();
    expect(scope.query.data()).toEqual({ ok: true });
    scope.destroy();
  });

  it("rejects loader combined with fetchFn at runtime", () => {
    expect(() =>
      createQueryScope({
        key: "/loader",
        options: {
          loader: async () => ({}),
        },
        fetchFn: fetch,
      })
    ).toThrow(/cannot be combined/);
  });

  it("rejects fetch transport fields on loader options at runtime", () => {
    expect(() =>
      createQueryScope({
        key: "/bad",
        options: {
          loader: async () => null,
          headers: { Authorization: "x" },
        } as never,
      })
    ).toThrow(/do not accept fetch transport/);
  });
});

describe("createQuery loader one-shot subscribable", () => {
  it("uses first synchronous emission only", async () => {
    const scope = createQueryScope<number>({
      key: "/sub",
      options: {
        loader: () => ({
          subscribe: ({ next }) => {
            next?.(1);
            next?.(2);
            return { unsubscribe: () => undefined };
          },
        }),
      },
    });

    await scope.query.fetch();
    await flushMicrotasks();
    expect(scope.query.data()).toBe(1);
    scope.destroy();
  });
});
