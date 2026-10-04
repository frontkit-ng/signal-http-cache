import { afterEach, describe, expect, it } from "vitest";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideHttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideSignalHttpCacheHttpClient } from "./http-client";
import { createQuery } from "./create-query";
import { ensureReactiveTestEnvironment } from "./test-support/angular-context";
import type { HttpQueryError } from "./types";

type SuccessCase = {
  label: string;
  body: string;
  status?: number;
  expected: unknown;
};

type FailureCase = {
  label: string;
  body: string;
  status: number;
  statusText: string;
};

const successCases: SuccessCase[] = [
  { label: "object JSON", body: '{"id":1}', expected: { id: 1 } },
  { label: "array JSON", body: "[1,2]", expected: [1, 2] },
  { label: "primitive JSON number", body: "42", expected: 42 },
  { label: "JSON null", body: "null", expected: null },
  { label: "empty response", body: "", expected: {} },
  { label: "204 no content", body: "", status: 204, expected: {} },
  { label: "malformed JSON/text", body: "not-json", expected: "not-json" },
];

const failureCases: FailureCase[] = [
  {
    label: "404",
    body: "missing",
    status: 404,
    statusText: "Not Found",
  },
  {
    label: "500",
    body: "error",
    status: 500,
    statusText: "Internal Server Error",
  },
];

function expectHttpFailure(err: HttpQueryError | null, failure: FailureCase) {
  expect(err).not.toBeNull();
  expect(err?.message).toBe(`HTTP ${failure.status}`);
  expect(err?.status).toBe(failure.status);
  expect(err?.statusText).toBe(failure.statusText);
}

describe("HttpClient transport parity (query path)", () => {
  let httpTesting: HttpTestingController;

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  function setup() {
    ensureReactiveTestEnvironment();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSignalHttpCacheHttpClient(),
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  }

  describe("successes", () => {
    for (const caseDef of successCases) {
      it(caseDef.label, async () => {
        setup();
        const path = `/http-parity/${encodeURIComponent(caseDef.label)}`;
        const query = TestBed.runInInjectionContext(() =>
          createQuery<unknown>(path)
        );

        const fetchPromise = query.fetch();
        const req = httpTesting.expectOne(path);
        const status = caseDef.status ?? 200;
        req.flush(caseDef.body, {
          status,
          statusText: status === 204 ? "No Content" : "OK",
        });
        await fetchPromise;
        expect(query.data()).toEqual(caseDef.expected);
      });
    }
  });

  describe("HTTP status failures", () => {
    for (const caseDef of failureCases) {
      it(caseDef.label, async () => {
        setup();
        const path = `/http-fail/${caseDef.label}`;
        const query = TestBed.runInInjectionContext(() =>
          createQuery<unknown>(path)
        );

        const fetchPromise = query.fetch();
        const req = httpTesting.expectOne(path);
        req.flush(caseDef.body, {
          status: caseDef.status,
          statusText: caseDef.statusText,
        });
        await fetchPromise;
        expectHttpFailure(query.error(), caseDef);
      });
    }
  });

  it("exposes HttpErrorResponse on cause for HttpClient error channel failures", async () => {
    setup();
    const query = TestBed.runInInjectionContext(() =>
      createQuery<unknown>("/http-network-fail")
    );

    const fetchPromise = query.fetch();
    const req = httpTesting.expectOne("/http-network-fail");
    req.error(new ProgressEvent("error"), {
      status: 0,
      statusText: "Unknown Error",
    });
    await fetchPromise;

    const err = query.error();
    expect(err?.message).toBe("HTTP 0");
    expect(err?.status).toBe(0);
    expect(err?.cause).toMatchObject({ status: 0, statusText: "Unknown Error" });
  });
});
