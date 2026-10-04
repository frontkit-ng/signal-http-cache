import { beforeAll, describe, expect, it } from "vitest";
import {
  createReactiveQueryScope,
  ensureReactiveTestEnvironment,
  flushReactiveEffects,
  signal,
} from "./test-support/angular-context";
import { flushMicrotasks } from "./test-support/fetch-mock";

describe("reactive query loader cache integration", () => {
  beforeAll(() => {
    ensureReactiveTestEnvironment();
  });

  it("key migration prevents late loader result from committing", async () => {
    let resolveA: ((value: string) => void) | undefined;
    let resolveB: ((value: string) => void) | undefined;

    const key = signal<"/lc-a" | "/lc-b">("/lc-a");
    const scope = createReactiveQueryScope<string>({
      key,
      options: {
        loader: ({ key: loaderKey }) => {
          if (loaderKey === "/lc-a") {
            return new Promise<string>((resolve) => {
              resolveA = resolve;
            });
          }
          return new Promise<string>((resolve) => {
            resolveB = resolve;
          });
        },
      },
    });

    key.set("/lc-b");
    flushReactiveEffects();
    expect(scope.query.isFetching()).toBe(true);

    resolveA?.("A-late");
    await flushMicrotasks();
    expect(scope.query.data()).toBeNull();

    resolveB?.("B");
    await flushMicrotasks();
    expect(scope.query.data()).toBe("B");

    scope.destroy();
  });
});
