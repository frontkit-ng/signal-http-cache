import { HttpHeaders } from "@angular/common/http";

export function normalizeHeadersForHttpClient(
  headers: HeadersInit | HttpHeaders | undefined
): HttpHeaders | undefined {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof HttpHeaders) {
    return headers;
  }

  if (headers instanceof Headers) {
    let httpHeaders = new HttpHeaders();
    headers.forEach((value, key) => {
      httpHeaders = httpHeaders.append(key, value);
    });
    return httpHeaders;
  }

  if (Array.isArray(headers)) {
    let httpHeaders = new HttpHeaders();
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(
          "Query fetch headers array must contain [name, value] pairs for HttpClient query transport."
        );
      }
      const [name, value] = entry;
      if (typeof name !== "string" || typeof value !== "string") {
        throw new Error(
          "Query fetch headers array must contain string name/value pairs for HttpClient query transport."
        );
      }
      httpHeaders = httpHeaders.append(name, value);
    }
    return httpHeaders;
  }

  return new HttpHeaders(headers);
}
