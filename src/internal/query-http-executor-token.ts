import { InjectionToken } from "@angular/core";
import type { QueryHttpExecutor } from "./http-transport-types";

export const QUERY_HTTP_EXECUTOR = new InjectionToken<QueryHttpExecutor>(
  "SIGNAL_HTTP_CACHE_QUERY_HTTP_EXECUTOR"
);
