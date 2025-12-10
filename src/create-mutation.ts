import { createBaseMutation } from "./create-base-mutation";
import { HttpMutation, HttpMutationOptions } from "./types";
import {
  hasHeader,
  isJsonSerializable,
  parseJsonSafe,
  serializeBody,
} from "./utils";

type UrlOrFn<TBody> = string | ((variables: TBody) => string);

export function createMutation<TData, TBody = void>(
  url: UrlOrFn<TBody>,
  options: HttpMutationOptions = {},
  fetchFn: typeof fetch = fetch
): HttpMutation<TData, TBody> {
  const {
    method = "POST",
    headers,
    onSuccess,
    onError,
    onFinally,
    invalidateKeys,
    retry,
    retryDelay,
    ...fetchOptions
  } = options;

  return createBaseMutation<TData, TBody>({
    onSuccess: onSuccess ? () => onSuccess() : undefined,
    onError: onError ? (err) => onError(err) : undefined,
    onFinally: onFinally ? () => onFinally() : undefined,
    invalidateKeys,
    retry,
    retryDelay,
    mutationFn: async (body) => {
      const resolvedUrl = typeof url === "function" ? url(body) : url;
      const requestBody = serializeBody(body);
      const needsJsonContentType =
        requestBody &&
        isJsonSerializable(body) &&
        !hasHeader(headers, "Content-Type");
      const res = await fetchFn(resolvedUrl, {
        ...fetchOptions,
        method,
        headers: {
          ...(needsJsonContentType && { "Content-Type": "application/json" }),
          ...headers,
        },
        body: requestBody,
      });

      if (!res.ok) {
        throw {
          message: `HTTP ${res.status}`,
          status: res.status,
          statusText: res.statusText,
        };
      }

      return parseJsonSafe<TData>(await res.text());
    },
  });
}
