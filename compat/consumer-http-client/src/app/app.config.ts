import { ApplicationConfig } from "@angular/core";
import { provideHttpClient } from "@angular/common/http";
import { provideSignalHttpCacheHttpClient } from "@frontkit-ng/signal-http-cache/http-client";

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(), provideSignalHttpCacheHttpClient()],
};
