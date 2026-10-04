import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { QUERY_HTTP_EXECUTOR } from "../internal/query-http-executor-token";
import { createHttpClientQueryExecutor } from "./http-client-query-executor";

export function provideSignalHttpCacheHttpClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: QUERY_HTTP_EXECUTOR,
      useFactory: () => createHttpClientQueryExecutor(inject(HttpClient)),
    },
  ]);
}
