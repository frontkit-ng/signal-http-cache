import type {
  HttpTransportFailure,
  HttpTransportResult,
  QueryHttpExecutor,
  QueryHttpGetRequest,
} from "./http-transport-types";

export function createFetchQueryExecutor(fetchFn: typeof fetch): QueryHttpExecutor {
  return async (request: QueryHttpGetRequest): Promise<HttpTransportResult> => {
    const { url, init, signal } = request;
    const response = await fetchFn(url, {
      ...init,
      method: "GET",
      signal,
    });

    const bodyText = await response.text();

    if (!response.ok) {
      const failure: HttpTransportFailure = {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        bodyText,
      };
      return failure;
    }

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      bodyText,
    };
  };
}
