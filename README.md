# @frontkit-ng/signal-http-cache

A Signal-based HTTP caching library for Angular.

[![npm version](https://img.shields.io/npm/v/@frontkit-ng/signal-http-cache.svg)](https://www.npmjs.com/package/@frontkit-ng/signal-http-cache)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-16+-dd0031.svg)](https://angular.io/)

---

## Features

- **Time-to-live based caching**

- **Stale-while-revalidate**

- **Request deduplication**

- **Pure Signals, no RxJS required**

- **Native `fetch` or provide your own (HttpClient, SSR, etc.)**

- **Auto cleanup via Angular `DestroyRef`**

- **Mutations for POST/PUT/PATCH/DELETE**

- **Retry with exponential backoff**

- **Race condition prevention**

- **Cache automatic invalidation**

---

## Installation

```bash
npm install @frontkit-ng/signal-http-cache
```

---

## Peer Dependencies

`@angular/core >=16.0.0`

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

### Stale-While-Revalidate

```ts
const query = createQuery<Data>("/api/data", {
  staleWhileRevalidate: true, // show stale data while fetching
});
```

### Force Refresh

Ignore cache, always fetch fresh data

```ts
await query.fetch(true);
```

### Invalidate Cache

Mark cache as stale and abort any pending request

```ts
query.invalidate();
```

---

### Parameterized Query Keys

Query keys determine how requests are cached.

```ts
const query = createQuery(["/api/users", page(), searchTerm(), sortBy()]);
```

Each unique combination creates a separate cache entry, perfect for:

- Pagination
- Search/filtering
- Sorting
- Any dynamic parameters

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

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
