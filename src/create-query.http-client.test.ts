import { describe, expect, it, afterEach } from "vitest";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import {
  provideHttpClient,
  withInterceptors,
  HttpInterceptorFn,
} from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideSignalHttpCacheHttpClient } from "./http-client";
import { createQuery } from "./create-query";
import { ensureReactiveTestEnvironment } from "./test-support/angular-context";
import { flushMicrotasks as flushFetchMicrotasks } from "./test-support/fetch-mock";

describe("createQuery HttpClient transport", () => {
  let httpTesting: HttpTestingController;

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  function setup(interceptors: HttpInterceptorFn[] = []) {
    ensureReactiveTestEnvironment();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors(interceptors)),
        provideHttpClientTesting(),
        provideSignalHttpCacheHttpClient(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  }

  it("routes query URL through HttpClient when provider registered", async () => {
    setup();
    const query = TestBed.runInInjectionContext(() =>
      createQuery<{ id: number }>("/api/item")
    );

    const fetchPromise = query.fetch();
    const req = httpTesting.expectOne("/api/item");
    expect(req.request.method).toBe("GET");
    req.flush(JSON.stringify({ id: 1 }));

    await fetchPromise;
    await flushFetchMicrotasks();
    expect(query.data()).toEqual({ id: 1 });
  });

  it("runs functional interceptors for query requests", async () => {
    const testInterceptor: HttpInterceptorFn = (req, next) => {
      return next(req.clone({ setHeaders: { "X-Test": "yes" } }));
    };
    setup([testInterceptor]);

    const query = TestBed.runInInjectionContext(() =>
      createQuery<string>("/api/intercepted")
    );

    void query.fetch();
    const req = httpTesting.expectOne("/api/intercepted");
    expect(req.request.headers.get("X-Test")).toBe("yes");
    req.flush(JSON.stringify("ok"));
    await flushFetchMicrotasks();
  });

  it("maps credentials include to withCredentials", async () => {
    setup();
    const query = TestBed.runInInjectionContext(() =>
      createQuery<unknown>("/api/creds", { credentials: "include" })
    );

    void query.fetch();
    const req = httpTesting.expectOne("/api/creds");
    expect(req.request.withCredentials).toBe(true);
    req.flush("{}");
    await flushFetchMicrotasks();
  });

  it("preserves repeated tuple headers on HttpClient requests", async () => {
    setup();
    const query = TestBed.runInInjectionContext(() =>
      createQuery<unknown>("/api/headers", {
        headers: [
          ["X-Multi", "a"],
          ["X-Multi", "b"],
        ],
      })
    );

    const fetchPromise = query.fetch();
    const req = httpTesting.expectOne("/api/headers");
    expect(req.request.headers.getAll("x-multi")).toEqual(["a", "b"]);
    req.flush("{}");
    await fetchPromise;
  });

  it("explicit fetchFn wins over HttpClient provider", async () => {
    setup();
    const fetchFn = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({ via: "fetch" }),
      }) as Response) as typeof fetch;

    const query = TestBed.runInInjectionContext(() =>
      createQuery<{ via: string }>("/api/wins", {}, fetchFn)
    );

    await query.fetch();
    expect(query.data()).toEqual({ via: "fetch" });
    httpTesting.expectNone("/api/wins");
  });
});
