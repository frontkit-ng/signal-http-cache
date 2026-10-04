import { describe, expect, it } from "vitest";
import { createMutation } from "./create-mutation";
import { jsonResponse } from "./test-support/fetch-mock";
import { provideSignalHttpCacheHttpClient } from "./http-client";
import { ensureReactiveTestEnvironment } from "./test-support/angular-context";
import { createQuery } from "./create-query";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { flushMicrotasks } from "./test-support/fetch-mock";

describe("createMutation outside injection context", () => {
  it("works without Angular injection context", async () => {
    const fetchFn = (async () => jsonResponse({ ok: true })) as typeof fetch;
    const mutation = createMutation<{ ok: boolean }>("/mut", {}, fetchFn);
    const data = await mutation.mutate(undefined as void);
    expect(data).toEqual({ ok: true });
  });

  it("is not affected by provideSignalHttpCacheHttpClient", async () => {
    ensureReactiveTestEnvironment();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSignalHttpCacheHttpClient(),
      ],
    });
    const httpTesting = TestBed.inject(HttpTestingController);

    let fetchCalls = 0;
    const fetchFn = (async () => {
      fetchCalls++;
      return jsonResponse({ source: "fetch" });
    }) as typeof fetch;

    const mutation = createMutation<{ source: string }>("/mut-http", {}, fetchFn);
    const result = await mutation.mutate(undefined as void);
    expect(result).toEqual({ source: "fetch" });
    expect(fetchCalls).toBe(1);

    const query = TestBed.runInInjectionContext(() =>
      createQuery<{ id: number }>("/query-http")
    );
    void query.fetch();
    httpTesting.expectOne("/query-http").flush(JSON.stringify({ id: 1 }));
    await flushMicrotasks();
    expect(query.data()).toEqual({ id: 1 });

    httpTesting.verify();
    TestBed.resetTestingModule();
  });
});
