import { HttpClient } from "@angular/common/http";
import type { HttpErrorResponse } from "@angular/common/http";
import { assertHttpClientCompatibleInit } from "../internal/http-client-query-init";
import { resolveHttpClientCredentials } from "../internal/http-client-query-init";
import type {
  HttpTransportFailure,
  HttpTransportResult,
  QueryHttpExecutor,
  QueryHttpGetRequest,
} from "../internal/http-transport-types";
import { normalizeHeadersForHttpClient } from "./normalize-http-headers";

function isHttpErrorResponse(err: unknown): err is HttpErrorResponse {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "statusText" in err
  );
}

function bodyTextFromUnknown(body: unknown): string {
  if (body === null || body === undefined) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

export function createHttpClientQueryExecutor(http: HttpClient): QueryHttpExecutor {
  return (request: QueryHttpGetRequest): Promise<HttpTransportResult> => {
    const { url, init, signal } = request;
    assertHttpClientCompatibleInit(init);

    const headers = normalizeHeadersForHttpClient(init.headers);
    const { withCredentials } = resolveHttpClientCredentials(init.credentials);

    return new Promise<HttpTransportResult>((resolve, reject) => {
      let settled = false;
      let subscription: { unsubscribe(): void } | undefined;

      const cleanup = (): void => {
        signal.removeEventListener("abort", onAbort);
        subscription?.unsubscribe();
        subscription = undefined;
      };

      const settle = (
        outcome: "resolve" | "reject",
        value: HttpTransportResult | unknown
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (outcome === "resolve") {
          resolve(value as HttpTransportResult);
        } else {
          reject(value);
        }
      };

      const onAbort = (): void => {
        settle("reject", new DOMException("Aborted", "AbortError"));
      };

      if (signal.aborted) {
        settle("reject", new DOMException("Aborted", "AbortError"));
        return;
      }

      signal.addEventListener("abort", onAbort);

      try {
        subscription = http
          .get(url, {
            headers,
            withCredentials,
            responseType: "text",
            observe: "response",
          })
          .subscribe({
            next: (response: {
              status: number;
              statusText: string;
              body: string | null;
            }) => {
              if (settled) {
                return;
              }
              const bodyText =
                typeof response.body === "string"
                  ? response.body
                  : bodyTextFromUnknown(response.body);

              if (response.status >= 200 && response.status < 300) {
                settle("resolve", {
                  ok: true,
                  status: response.status,
                  statusText: response.statusText,
                  bodyText,
                });
                return;
              }

              const failure: HttpTransportFailure = {
                ok: false,
                status: response.status,
                statusText: response.statusText,
                bodyText,
              };
              settle("resolve", failure);
            },
            error: (err: unknown) => {
              if (settled) {
                return;
              }
              if (isHttpErrorResponse(err)) {
                const failure: HttpTransportFailure = {
                  ok: false,
                  status: err.status,
                  statusText: err.statusText,
                  bodyText: bodyTextFromUnknown(err.error),
                  cause: err,
                };
                settle("resolve", failure);
                return;
              }
              settle("reject", err);
            },
          });
        if (settled) {
          subscription?.unsubscribe();
          subscription = undefined;
        }
      } catch (err) {
        settle("reject", err);
      }
    });
  };
}
