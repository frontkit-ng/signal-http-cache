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

- **Native `fetch`, optional Angular `HttpClient` for queries, custom `fetchFn`, or a `loader`**

- **Auto cleanup via Angular `DestroyRef`**

- **Mutations for POST/PUT/PATCH/DELETE**

- **Configurable mutation retry**

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

The default `ttl` is `0`, which means cached data is treated as stale on the next `fetch()` and the query revalidates immediately (unless you use stale-while-revalidate). Set `ttl` above zero when completed-response reuse is desired; the default prioritizes freshness. In-flight deduplication still applies at the default TTL.

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

When you invalidate a cache key, any in-flight request for that key is aborted and the entry is marked stale. Queries that are already using that key then refresh on their own—you do not need to call `fetch()` again for each one.

```ts
query.invalidate();
```

The same applies when a mutation lists keys in `invalidateKeys`.

**`createQuery`** still does not fetch on its own when the component is created. You call `fetch()` (or `fetch(true)`) for the initial load. After that first call, invalidation of the key will refresh this query automatically. If you have never called `fetch()`, invalidation does not start the first request.

**`createReactiveQuery`** refreshes while its key is active. When the key is `undefined`, the query is inactive and invalidation does not fetch.

If no component is using a key anymore, or a static query has never been fetched, invalidation only affects cache state when an entry already exists—it does not start a new request.

### Query state: `isLoading` and `isFetching`

- **`isLoading()`** — blocking initial load (no successful response yet for the current key). Use for initial spinners and empty states.
- **`isFetching()`** — this query instance is participating in a GET for its active key, including background refresh. Use when you need to show activity without hiding existing data.

During stale-while-revalidate or invalidation refresh, `isFetching()` is typically `true` while `isLoading()` stays `false`.

```html
@if (usersQuery.isLoading()) {
  <p>Loading users…</p>
} @else if (usersQuery.data(); as users) {
  <ul>
    @for (user of users; track user.id) {
      <li>{{ user.name }}</li>
    }
  </ul>
  @if (usersQuery.isFetching() && !usersQuery.isLoading()) {
    <span class="refresh-hint">Updating…</span>
  }
}
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

When the last Angular consumer for a query key is destroyed, any active request for that key is aborted. Settled cache data may remain available briefly for remounts (default **60 seconds**); use `retentionTime: 0` for immediate removal (previous behavior).

### Consumer lifecycle

`createQuery()` participates in shared cache state for as long as its Angular owner is alive.

- Multiple live consumers of the same query key share cached data and in-flight work.
- Destroying one consumer does not remove shared cache state while other consumers still exist.
- When the final consumer is destroyed, in-flight work stops and **unused** settled data is kept for a short time (see **Cache freshness vs retention** below) so routes, `@if`, and reactive key changes can reuse it without refetching.
- `ttl` controls whether cached data is **fresh** while an entry exists. `retentionTime` controls how long **unused** settled data stays in memory after the last consumer is gone.

#### Cache freshness vs retention

| Option | Meaning |
|--------|---------|
| `ttl` | Freshness while a cache entry exists (default `0` = revalidate on fetch when stale). |
| `retentionTime` | How long unused settled data may remain after the last consumer is destroyed (default `60000` ms). |

Advanced — immediate cleanup (memory-sensitive lists, huge key cardinality):

```ts
createQuery("/api/large-list", { retentionTime: 0 });
```

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

Use `createReactiveQuery` when the cache key should follow a `Signal<QueryKey | undefined>` (for example route params, filters, or pagination):

```ts
import { computed, signal } from "@angular/core";
import { createReactiveQuery } from "@frontkit-ng/signal-http-cache";
import type { QueryKey } from "@frontkit-ng/signal-http-cache";

const page = signal(1);
const usersKey = computed(() => ["/api/users", page()] as const);

private usersQuery = createReactiveQuery<User[]>(usersKey, { ttl: 60_000 });
readonly users = this.usersQuery.data;
```

When the key signal is `undefined`, the query is **inactive** — no cache identity, no fetch. Use this for nullable route IDs, absent selections, or filters that are not ready yet:

```ts
const userId = input<string | undefined>();

private userKey = computed<QueryKey | undefined>(() => {
  const id = this.userId();
  return id ? [`/api/users/${id}`] as const : undefined;
});

private userQuery = createReactiveQuery<User>(this.userKey, { ttl: 60_000 });
```

For search or filter inputs that change rapidly, debounce the input signal (or use RxJS) before it feeds the key `computed` — the library does not debounce key changes.

`createReactiveQuery` automatically performs cache-aware fetching when a **new serialized key becomes active** — synchronously for the initial key (when not `undefined`), then when Angular's key-observation effect observes a stabilized key change. Intermediate coalesced signal writes may be skipped (for example `A → C` without activating `B`, or `A → undefined → B` coalescing to `A → B`).

Unlike static `createQuery`, reactive queries **do not** require a manual initial `fetch()` for the bound key.

`fetch()`, `fetch(true)`, and `invalidate()` always target the **current active key** at call time when the query is active. While inactive (`undefined` key), `fetch()` resolves immediately without a network request and `invalidate()` is a no-op.

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
    @if (isLoading()) {
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
    invalidateKeys: ["/api/todos"],
  });

  deleteMutation = createMutation<void, string>((id) => `/api/todos/${id}`, {
    method: "DELETE",
    invalidateKeys: ["/api/todos"],
  });

  todos = this.todosQuery.data;
  isLoading = this.todosQuery.isLoading;

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

## Transport

### Default: native `fetch`

`createQuery` and `createReactiveQuery` use the browser `fetch` API with **no extra setup**:

```ts
users = createReactiveQuery<User[]>("/api/users");
```

### Optional: Angular `HttpClient` for queries

Add the library provider **next to your existing** `provideHttpClient()` configuration (do not register `HttpClient` twice):

```ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient, withInterceptors } from "@angular/common/http";
import { provideSignalHttpCacheHttpClient } from "@frontkit-ng/signal-http-cache/http-client";

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideSignalHttpCacheHttpClient(),
  ],
};
```

Query call sites stay the same. Interceptors and `HttpClient` configuration apply to cached GET queries.

`provideSignalHttpCacheHttpClient()` affects **`createQuery` / `createReactiveQuery` only**. `createMutation` continues to use `fetch` by default (or an explicit third-argument `fetchFn`).

Requires optional peer `@angular/common` when using the `/http-client` entry.

### Custom `fetchFn`

Pass a `fetch`-compatible function as the third argument to override transport for that query instance (mutually exclusive with `loader`).

### `loader` (API services)

Use a one-shot loader when the request should run through your own service (for example an existing `HttpClient` API wrapper). The loader receives `QueryLoaderParams` with `key` and `abortSignal`:

```ts
users = createReactiveQuery<User[]>("/api/users", {
  loader: ({ abortSignal }) => usersApi.getUsers({ signal: abortSignal }),
});
```

Loader options include cache settings (`ttl`, `staleWhileRevalidate`) only — not `RequestInit` fields. If the loader returns an Angular `Observable`, only the **first** emitted value is used (one-shot semantics).

---

## Limitations

- Cache state is browser/client scoped by design. The current architecture uses module-level shared cache state and does not provide per-request isolation for Angular SSR or server rendering.
- Angular SSR is not currently supported. Supplying a custom transport does not make SSR safe with the current cache model.
- Query keys are resolved once when `createQuery()` is called. Use `createReactiveQuery` for signal-driven identity.
- `createQuery()` and `createReactiveQuery()` must be called synchronously within an Angular injection context so `DestroyRef` (and `effect()` for reactive queries) can register cleanup.

---

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
