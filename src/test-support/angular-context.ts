import {
  createEnvironmentInjector,
  EnvironmentInjector,
  platformCore,
  runInInjectionContext,
  signal,
  Signal,
} from "@angular/core";
import type { Injector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { createQuery } from "../create-query";
import { createReactiveQuery } from "../create-reactive-query";
import type { HttpQuery } from "../types";
import type { QueryKey, QueryOptions } from "../types";

export type QueryFactoryOptions<T> = {
  key: QueryKey;
  options?: Omit<QueryOptions, "method">;
  fetchFn?: typeof fetch;
};

export type ReactiveQueryFactoryOptions<T> = {
  key: Signal<QueryKey | undefined>;
  options?: Omit<QueryOptions, "method">;
  fetchFn?: typeof fetch;
};

export type QueryScope<T> = {
  injector: EnvironmentInjector;
  query: HttpQuery<T>;
  destroy: () => void;
};

let platformEnvironmentInjector: EnvironmentInjector | undefined;
let reactiveTestEnvironmentReady = false;

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

function ensureReactiveTestEnvironment(): void {
  if (reactiveTestEnvironmentReady) {
    return;
  }
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting()
  );
  reactiveTestEnvironmentReady = true;
}

/** Flush scheduled Angular effects after batched key Signal writes. */
export function flushReactiveEffects(): void {
  ensureReactiveTestEnvironment();
  TestBed.flushEffects();
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

/**
 * Creates an isolated reactive query for a single test. Resets TestBed first so
 * each test gets a fresh injection context with working `effect()` support.
 */
export function createReactiveQueryScope<T>(
  config: ReactiveQueryFactoryOptions<T>
): QueryScope<T> {
  ensureReactiveTestEnvironment();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});

  const injector = TestBed.inject(EnvironmentInjector);
  const query = runInInjectionContext(injector, () =>
    createReactiveQuery<T>(
      config.key,
      config.options ?? {},
      config.fetchFn ?? fetch
    )
  );

  return {
    injector,
    query,
    destroy: () => TestBed.resetTestingModule(),
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

export { signal };
