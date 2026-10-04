import type { QueryFetchInit } from "../types";

export type QueryHttpGetRequest = {
  url: string;
  init: QueryFetchInit;
  signal: AbortSignal;
};

export type HttpTransportSuccess = {
  ok: true;
  status: number;
  statusText: string;
  bodyText: string;
};

export type HttpTransportFailure = {
  ok: false;
  status: number;
  statusText: string;
  bodyText: string;
  cause?: unknown;
};

export type HttpTransportResult = HttpTransportSuccess | HttpTransportFailure;

export type QueryHttpExecutor = (
  request: QueryHttpGetRequest
) => Promise<HttpTransportResult>;
