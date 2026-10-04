import { describe, expect, it } from "vitest";
import { createQueryScope } from "./test-support/angular-context";
import { createSequentialFetch } from "./test-support/fetch-mock";
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

describe("fetch transport parity (query path)", () => {
  describe("successes", () => {
    for (const caseDef of successCases) {
      it(caseDef.label, async () => {
        const status = caseDef.status ?? 200;
        const { fetchFn } = createSequentialFetch([
          async () =>
            ({
              ok: status >= 200 && status < 300,
              status,
              statusText: status === 204 ? "No Content" : "OK",
              text: async () => caseDef.body,
            }) as Response,
        ]);

        const scope = createQueryScope<unknown>({
          key: `/fetch-parity/${caseDef.label}`,
          fetchFn,
        });

        await scope.query.fetch();
        expect(scope.query.data()).toEqual(caseDef.expected);
        scope.destroy();
      });
    }
  });

  describe("HTTP failures", () => {
    for (const caseDef of failureCases) {
      it(caseDef.label, async () => {
        const scope = createQueryScope<unknown>({
          key: `/fetch-fail/${caseDef.label}`,
          fetchFn: async () =>
            ({
              ok: false,
              status: caseDef.status,
              statusText: caseDef.statusText,
              text: async () => caseDef.body,
            }) as Response,
        });

        await scope.query.fetch();
        expectHttpFailure(scope.query.error(), caseDef);
        scope.destroy();
      });
    }
  });
});
