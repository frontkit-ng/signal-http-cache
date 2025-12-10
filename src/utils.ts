import { HttpQueryError } from "./types";

export function hasHeader(
  headers: HeadersInit | undefined,
  name: string
): boolean {
  if (!headers) return false;

  if (headers instanceof Headers) {
    return headers.has(name);
  }

  if (Array.isArray(headers)) {
    return headers.some(([key]) => key.toLowerCase() === name.toLowerCase());
  }

  return Object.keys(headers).some(
    (k) => k.toLowerCase() === name.toLowerCase()
  );
}

export function isJsonSerializable(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !(value instanceof FormData) &&
    !(value instanceof Blob)
  );
}

export function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;

  if (isJsonSerializable(body)) return JSON.stringify(body);

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    typeof body === "string"
  ) {
    return body as BodyInit;
  }

  return undefined;
}

export function parseJsonSafe<T>(text: string): T {
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
}

export function toHttpQueryError(
  err: unknown,
  defaultMessage = "Request failed"
): HttpQueryError {
  if (typeof err === "object" && err && "message" in err) {
    const anyErr = err as any;
    return {
      message: String(anyErr.message ?? defaultMessage),
      status: anyErr.status,
      statusText: anyErr.statusText,
      cause: err,
    };
  }
  return { message: defaultMessage, cause: err };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
