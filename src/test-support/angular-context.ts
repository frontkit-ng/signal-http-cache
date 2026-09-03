import {
  createEnvironmentInjector,
  EnvironmentInjector,
  platformCore,
  runInInjectionContext,
} from "@angular/core";
import type { Injector } from "@angular/core";
import { createQuery } from "../create-query";
import type { HttpQuery } from "../types";
import type { QueryKey, QueryOptions } from "../types";

export type QueryFactoryOptions<T> = {
  key: QueryKey;
  options?: Omit<QueryOptions, "method">;
  fetchFn?: typeof fetch;
};

export type QueryScope<T> = {
  injector: EnvironmentInjector;
  query: HttpQuery<T>;
  destroy: () => void;
};

let platformEnvironmentInjector: EnvironmentInjector | undefined;

function assertEnvironmentInjector(
  injector: Injector
): asserts injector is EnvironmentInjector {
  if (!(injector instanceof EnvironmentInjector)) {
    throw new Error("Expected an EnvironmentInjector");
  }
}

function getPlatformEnvironmentInjector(): EnvironmentInjector {
  if (!platformEnvironmentInjector) {
    const injector = platformCore().injector;
    assertEnvironmentInjector(injector);
    platformEnvironmentInjector = injector;
  }
  return platformEnvironmentInjector;
}

export function createQueryScope<T>(
  config: QueryFactoryOptions<T>
): QueryScope<T> {
  const injector = createEnvironmentInjector(
    [],
    getPlatformEnvironmentInjector(),
    "query-scope"
  );
  const query = runInInjectionContext(injector, () =>
    createQuery<T>(config.key, config.options ?? {}, config.fetchFn ?? fetch)
  );

  return {
    injector,
    query,
    destroy: () => injector.destroy(),
  };
}

export function createQueryScopes<T>(
  key: QueryKey,
  count: number,
  config?: Omit<QueryFactoryOptions<T>, "key">
): QueryScope<T>[] {
  return Array.from({ length: count }, () =>
    createQueryScope<T>({ key, ...config })
  );
}
