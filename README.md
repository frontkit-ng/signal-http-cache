# @frontkit-ng/signal-http-cache

A Signal-based HTTP caching library for Angular.

[![npm version](https://img.shields.io/npm/v/@frontkit-ng/signal-http-cache.svg)](https://www.npmjs.com/package/@frontkit-ng/signal-http-cache)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-16--22-dd0031.svg)](https://angular.io/)

---

## Features

- **Time-to-live based caching**

- **Stale-while-revalidate**

- **Request deduplication**

- **Pure Signals, no RxJS required**

- **Native `fetch` or provide your own transport (for example HttpClient via a fetch adapter)**

- **Auto cleanup via Angular `DestroyRef`**

- **Mutations for POST/PUT/PATCH/DELETE**

- **Retry with configurable delay**

- **Safe force-refresh concurrency**

- **Cache automatic invalidation**

---

## Installation

```bash
npm install @frontkit-ng/signal-http-cache
```

---

## Angular compatibility

| | |
|---|---|
| **Minimum Angular** | 16 |
| **Tested Angular majors** | 16, 17, 18, 19, 20, 21, 22 |
| **Peer dependency** | `@angular/core >=16.0.0 <23.0.0` |

Compatibility is verified through lightweight consumer install, typecheck, and build checks in CI using the packed npm-style artifact for each tested major. Core package semantics (caching, lifecycle, mutations, concurrency) are covered by the main behavioral test suite; the compatibility matrix protects packaged consumption across Angular versions.

This package intentionally preserves compatibility with Angular 16 where possible. Angular-native `resource()` / `httpResource()` APIs are optional comparison points for newer apps — they are not dependencies or prerequisites.

---

## Peer Dependencies

`@angular/core >=16.0.0 <23.0.0`

---

## Queries

Use `createQuery` to fetch and cache data.

`createQuery()` must be called synchronously within an Angular injection context (for example, a component or service field initializer). It uses `DestroyRef` to automatically release that query consumer when its Angular owner is destroyed.

Calling `createQuery()` later from arbitrary methods, event handlers, timers, or plain helpers outside Angular DI will fail unless you explicitly run it inside an injection context.

`createMutation()` and `createBaseMutation()` do not use `DestroyRef` and do not share this requirement.

### Basic Query

```ts
import { Component, OnInit } from "@angular/core";
import { createQuery } from "@frontkit-ng/signal-http-cache";

@Component({ /* ... */ })
export class UsersComponent implements OnInit {
  private usersQuery = createQuery<User[]>("/api/users");

  ngOnInit() {
    this.usersQuery.fetch();
  }

  get users() {
    return this.usersQuery.data;
  }
}
```

### TTL (Time-to-live)

```ts
const query = createQuery("/api/data", {
  ttl: 60000, // cache for 60 seconds
});
```

The default `ttl` is `0`, which means cached data is treated as stale on the next `fetch()` and the query revalidates immediately (unless you use stale-while-revalidate).

### Stale-While-Revalidate

```ts
const query = createQuery<Data>("/api/data", {
  staleWhileRevalidate: true, // show stale data while fetching
});
```

### Force Refresh

`fetch(true)` bypasses a fresh cache entry and supersedes any in-flight request for the same query key. Use it when you need the latest data regardless of TTL or pending work.

A superseded request cannot overwrite the result of the newer force refresh.

```ts
await query.fetch(true);
```

### Invalidate Cache

`invalidate()` marks the cache entry stale and aborts any active request for that query key. The query is not permanently blocked afterward — a later `fetch()` can proceed normally.

```ts
query.invalidate();
```

---

## Caching behavior

These are the observable guarantees of the current API.

### Shared cache and request deduplication

Queries that resolve to the same cache key share cached data and active request work. If two consumers call `fetch()` while a request is already in flight for that key, only one transport request runs and both callers receive the same result.

### Failure recovery

A failed request does not permanently block the query. After an error, a later `fetch()` can retry normally and update the query state on success.

### Abort and invalidation recovery

`invalidate()` aborts the active request for that query key according to the API contract. Pending callers settle, and the query is not left permanently blocked. A subsequent `fetch()` can proceed.

When the last Angular consumer for a query key is destroyed, any active request for that key is aborted and owned cache state is released.

### Consumer lifecycle

`createQuery()` participates in shared cache state for as long as its Angular owner is alive.

- Multiple live consumers of the same query key share cached data and in-flight work.
- Destroying one consumer does not remove shared cache state while other consumers still exist.
- When the final consumer is destroyed, owned cache and request resources for that key are cleaned up automatically via `DestroyRef`.

`createMutation()` and `createBaseMutation()` do not participate in this query lifecycle model.

---

### Parameterized Query Keys

Query keys determine how requests are cached. A key can be a string or a tuple whose first element is the request URL:

```ts
createQuery(["/api/users", 1, "active"]);
```

The cache key is resolved **once**, when `createQuery()` is called. Changing a `signal()` or other reactive value later does **not** update an already-created query's cache key.

For pagination, search, or sorting, call `createQuery()` with the current parameter values when you need a distinct cache entry. Each distinct resolved key gets its own cache entry.

### Reactive query identity (`createReactiveQuery`)

Use `createReactiveQuery` when the cache key should follow a `Signal<QueryKey>` (for example route params, filters, or pagination):

```ts
import { computed, signal } from "@angular/core";
import { createReactiveQuery } from "@frontkit-ng/signal-http-cache";

const page = signal(1);
const usersKey = computed(() => ["/api/users", page()] as const);

private usersQuery = createReactiveQuery<User[]>(usersKey, { ttl: 60_000 });
readonly users = this.usersQuery.data;
```

`createReactiveQuery` automatically performs cache-aware fetching when a **new serialized key becomes active** — synchronously for the initial key, then when Angular's key-observation effect observes a stabilized key change. Intermediate coalesced signal writes may be skipped (for example `A → C` without activating `B`).

Unlike static `createQuery`, reactive queries **do not** require a manual initial `fetch()` for the bound key.

`fetch()`, `fetch(true)`, and `invalidate()` always target the **current active key** at call time. After construction returns, the active key is already defined.

Static `createQuery` is unchanged.

---

## Mutations

Use `createMutation` for data modifications (POST, PUT, PATCH, DELETE).

### Basic Mutation

```ts
import { createMutation } from "@frontkit-ng/signal-http-cache";

const updateUser = createMutation<User, UpdateUserDto>("/api/users", {
  method: "PUT",
  onSuccess: () => toast.success("Saved!"),
  onError: (err) => toast.error(err.message),
  onFinally: () => closeModal(),
});
```

---

### Mutation with Dynamic URL

For DELETE/PUT/PATCH where the ID is in the URL:

```ts
const deleteTodo = createMutation<void, number>((id) => `/api/todos/${id}`, {
  method: "DELETE",
});

deleteTodo.mutate(5); // DELETE /api/todos/5
```

---

### Mutation with Retry

```ts
const submitForm = createMutation<Response, FormData>("/api/submit", {
  retry: 3,
  retryDelay: (attempt) => 1000 * 2 ** attempt, // exponential backoff
});
```

## Full Component Example

```ts
import { Component, OnInit } from "@angular/core";
import { createQuery, createMutation } from "@frontkit-ng/signal-http-cache";

interface Todo {
  id: string;
  title: string;
}

@Component({
  selector: "app-todos",
  standalone: true,
  template: `
    @if (loading()) {
    <p>Loading...</p>
    } @if (todos()) {
    <ul>
      @for (todo of todos(); track todo.id) {
      <li>
        {{ todo.title }}
        <button
          (click)="delete(todo.id)"
          [disabled]="deleteMutation.isPending()"
        >
          Delete
        </button>
      </li>
      }
    </ul>
    }

    <input #input type="text" placeholder="New todo" />
    <button (click)="add(input)" [disabled]="addMutation.isPending()">
      {{ addMutation.isPending() ? "Adding..." : "Add" }}
    </button>
  `,
})
export class TodosComponent implements OnInit {
  private todosQuery = createQuery<Todo[]>("/api/todos", { ttl: 60000 });

  addMutation = createMutation<Todo, { title: string }>("/api/todos", {
    onSuccess: () => this.todosQuery.fetch(true),
  });

  deleteMutation = createMutation<void, string>((id) => `/api/todos/${id}`, {
    method: "DELETE",
    invalidateKeys: ["/api/todos"],
  });

  todos = this.todosQuery.data;
  loading = this.todosQuery.loading;

  ngOnInit() {
    this.todosQuery.fetch();
  }

  add(input: HTMLInputElement) {
    if (input.value) {
      this.addMutation.mutate({ title: input.value });
      input.value = "";
    }
  }

  delete(id: string) {
    this.deleteMutation.mutate(id);
  }
}
```

---

## Using Angular HttpClient (Optional)

By default, the library uses the native browser `fetch` API. To use Angular's `HttpClient` instead (for interceptors, auth tokens, etc.), create an adapter:

This is **optional** - the library does **not** require `HttpClient`.

### HttpClient Adapter

Call `inject(HttpClient)` inside an injection context, then return a fetch-compatible function that captures the client:

```ts
// http-client-adapter.ts

import { inject } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom, catchError, of } from "rxjs";

export function createHttpClientFetchFn() {
  const http = inject(HttpClient);

  return (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;

    let body: unknown = undefined;
    if (init?.body) {
      if (typeof init.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      } else {
        body = init.body;
      }
    }

    return firstValueFrom(
      http
        .request<unknown>(method, url, {
          body,
          headers,
          observe: "response",
          responseType: "json",
        })
        .pipe(
          catchError((err: HttpErrorResponse) => {
            return of({
              ok: false,
              status: err.status,
              statusText: err.statusText,
              body: err.error,
            });
          })
        )
    ).then((response) => {
      const responseBody = response.body;
      const bodyText =
        typeof responseBody === "string"
          ? responseBody
          : JSON.stringify(responseBody ?? "");

      return {
        ok: response.ok ?? (response.status >= 200 && response.status < 300),
        status: response.status,
        statusText: response.statusText,
        json: () => Promise.resolve(responseBody),
        text: () => Promise.resolve(bodyText),
      } as Response;
    });
  };
}
```

### Using the Adapter

Create the fetch function in an injection context, then pass it to `createQuery` or `createMutation`:

```ts
import { Component } from "@angular/core";
import { createQuery, createMutation } from "@frontkit-ng/signal-http-cache";
import { createHttpClientFetchFn } from "./http-client-adapter";

@Component({ /* ... */ })
export class UsersComponent {
  private httpFetch = createHttpClientFetchFn();

  private users = createQuery<User[]>(
    "/api/users",
    { ttl: 60000 },
    this.httpFetch
  );

  addUser = createMutation<User, { name: string }>(
    "/api/users",
    { onSuccess: () => this.users.fetch(true) },
    this.httpFetch
  );
}
```

---

## When to use this library vs Angular `httpResource()`

On Angular versions that include native resource APIs, `httpResource()` is a good fit when the main requirement is reactive HttpClient-backed loading for an individual resource.

`signal-http-cache` adds value when the application needs the capabilities implemented here:

- shared cache state across multiple consumers of the same query key
- TTL and stale-while-revalidate behavior
- in-flight request deduplication
- mutation-driven cache invalidation

Native Angular resource APIs are optional comparison points for newer Angular apps. They are not prerequisites for installing or using this package.

---

## Limitations

- Cache state is browser/client scoped by design. The current architecture uses module-level shared cache state and does not provide per-request isolation for Angular SSR or server rendering.
- Angular SSR is not currently supported. Supplying a custom transport does not make SSR safe with the current cache model.
- Query keys are resolved once when `createQuery()` is called. Use `createReactiveQuery` for signal-driven identity.
- `createQuery()` and `createReactiveQuery()` must be called synchronously within an Angular injection context so `DestroyRef` (and `effect()` for reactive queries) can register cleanup.

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
