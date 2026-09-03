import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheStore } from "./cache-store";
import { createBaseMutation } from "./create-base-mutation";
import { createMutation } from "./create-mutation";
import { createQueryScope } from "./test-support/angular-context";
import {
  createDeferredFetch,
  flushMicrotasks,
  jsonResponse,
} from "./test-support/fetch-mock";

describe("mutation behavior", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("26. mutation success clears error and reaches success state", async () => {
    const mutation = createBaseMutation<{ id: number }, { name: string }>({
      mutationFn: async () => ({ id: 1 }),
    });

    expect(mutation.isIdle()).toBe(true);

    const result = await mutation.mutate({ name: "test" });

    expect(result).toEqual({ id: 1 });
    expect(mutation.isSuccess()).toBe(true);
    expect(mutation.isPending()).toBe(false);
    expect(mutation.error()).toBeNull();
    expect(mutation.data()).toEqual({ id: 1 });
  });

  it("27. mutation failure surfaces error and terminates pending state", async () => {
    const mutation = createBaseMutation<never, void>({
      mutationFn: async () => {
        throw { message: "HTTP 400", status: 400 };
      },
    });

    await expect(mutation.mutate()).rejects.toMatchObject({
      message: expect.stringContaining("HTTP 400"),
    });

    expect(mutation.isError()).toBe(true);
    expect(mutation.isPending()).toBe(false);
    expect(mutation.error()?.status).toBe(400);
  });

  it("28. mutation invalidateKeys invalidates only configured query keys", async () => {
    const usersFetch = createDeferredFetch();
    const postsFetch = createDeferredFetch();

    const usersScope = createQueryScope<{ v: number }>({
      key: "/users",
      options: { ttl: 60_000 },
      fetchFn: usersFetch.fetchFn,
    });
    const postsScope = createQueryScope<{ v: number }>({
      key: "/posts",
      options: { ttl: 60_000 },
      fetchFn: postsFetch.fetchFn,
    });

    const usersPromise = usersScope.query.fetch();
    await usersFetch.resolvePending({ v: 1 });
    await usersPromise;

    const postsPromise = postsScope.query.fetch();
    await postsFetch.resolvePending({ v: 2 });
    await postsPromise;

    const beforeUsersTimestamp = cacheStore.get("/users")?.timestamp;
    const beforePostsTimestamp = cacheStore.get("/posts")?.timestamp;

    const mutation = createBaseMutation<unknown, { name: string }>({
      mutationFn: async () => ({}),
      invalidateKeys: ["/users"],
    });

    await mutation.mutate({ name: "x" });

    expect(cacheStore.get("/users")?.timestamp).toBe(0);
    expect(cacheStore.get("/posts")?.timestamp).toBe(beforePostsTimestamp);
    expect(beforeUsersTimestamp).toBeGreaterThan(0);

    usersScope.destroy();
    postsScope.destroy();
  });

  it("29. mutation retry succeeds after configured retries", async () => {
    vi.useFakeTimers();

    let attempts = 0;
    const mutation = createBaseMutation<{ ok: boolean }, void>({
      retry: 2,
      retryDelay: 100,
      mutationFn: async () => {
        attempts++;
        if (attempts < 3) {
          throw { message: "temporary" };
        }
        return { ok: true };
      },
    });

    const mutatePromise = mutation.mutate();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);
    const result = await mutatePromise;

    expect(result).toEqual({ ok: true });
    expect(attempts).toBe(3);
    expect(mutation.isSuccess()).toBe(true);
  });

  it("29b. mutation retry exhausts and fails terminally", async () => {
    let attempts = 0;
    const mutation = createBaseMutation<never, void>({
      retry: 1,
      retryDelay: 1,
      mutationFn: async () => {
        attempts++;
        throw { message: "permanent" };
      },
    });

    await expect(mutation.mutate()).rejects.toMatchObject({
      message: expect.stringContaining("permanent"),
    });
    expect(attempts).toBe(2);
    expect(mutation.isError()).toBe(true);
  });

  it("createMutation uses fetch transport and returns parsed data", async () => {
    const fetchFn = (async () => jsonResponse({ id: 9 })) as typeof fetch;
    const mutation = createMutation<{ id: number }, { title: string }>(
      "/todos",
      {},
      fetchFn
    );

    const result = await mutation.mutate({ title: "x" });
    expect(result).toEqual({ id: 9 });
    expect(mutation.isSuccess()).toBe(true);
  });
});
