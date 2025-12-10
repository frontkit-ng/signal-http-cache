# @frontkit-ng/signal-http-cache

A lightweight, Signal-powered HTTP caching library for Angular.

[![npm version](https://img.shields.io/npm/v/@frontkit-ng/signal-http-cache.svg)](https://www.npmjs.com/package/@frontkit-ng/signal-http-cache)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Angular](https://img.shields.io/badge/Angular-16+-dd0031.svg)](https://angular.io/)

---

## ✨ Features

⚡ **TTL-based Caching** — Automatic cache expiration with configurable time-to-live

🔄 **Stale-While-Revalidate** — Serve cached data instantly while fetching fresh data in background

🚫 **Request Deduplication** — Multiple components share the same in-flight request

🧠 **Pure Signals** — Native Angular Signals, no RxJS required

🌐 **Custom Fetch** - Use native `fetch` or provide your own (HttpClient, SSR, etc.)

🧹 **Auto Cleanup** — Automatic cache cleanup via Angular `DestroyRef`

📝 **Mutations** — Full support for POST/PUT/PATCH/DELETE with state tracking

🔁 **Retry Support** — Configurable retry with exponential backoff

🎯 **Race Condition Prevention** — Force refresh aborts previous pending requests

🗑️ **Cache Invalidation** — Automatically invalidate queries after mutations

---

## 📦 Installation

```bash
npm install @frontkit-ng/signal-http-cache
```

---

## 📌 Peer Dependencies

`@angular/core >=16.0.0`

---

## 🔍 Queries

Use `createQuery` to fetch and cache data.

### Basic Query

```ts
import { createQuery } from "@frontkit-ng/signal-http-cache";

const usersQuery = createQuery<User[]>("/api/users");

// Fetch data
await usersQuery.fetch();

// Reactive state
usersQuery.data();
usersQuery.loading();
usersQuery.error();
```

### TTL (Time-to-Live)

```ts
const query = createQuery("/api/data", {
  ttl: 60000, // Cache for 60 seconds
});
```

### Stale-While-Revalidate

```ts
const query = createQuery<Data>("/api/data", {
  staleWhileRevalidate: true, // Show stale data while fetching
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

## ✏️ Mutations

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
  retryDelay: (attempt) => 1000 * 2 ** attempt, // Exponential backoff
});
```

## 🧩 Full Component Example

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

## 📡 Using Angular HttpClient (Optional)

By default, the library uses the native browser `fetch` API. To use Angular's `HttpClient` instead (for interceptors, auth tokens, etc.), create an adapter:

This is **optional** - the library does **not** require `HttpClient`.

### HttpClient Adapter

```ts
// http-client-adapter.ts

import { inject } from "@angular/core";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { firstValueFrom, catchError, of } from "rxjs";

export function httpClientAdapter(url: string, init?: RequestInit) {
  const http = inject(HttpClient);

  const method = init?.method ?? "GET";
  const headers = init?.headers as Record<string, string> | undefined;

  let body: any = undefined;
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
          } as any);
        })
      )
  ).then((response: any) => {
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
      text: () => Promise.resolve(bodyText), // ← Required for createMutation
    } as Response;
  });
}
```

### Using the Adapter

Pass your adapter as the third argument to `createQuery` or `createMutation`:

```ts
import { createQuery } from "@frontkit-ng/signal-http-cache";
import { httpClientAdapter } from "./http-client-adapter";

// Query
const users = createQuery<User[]>(
  "/api/users",
  { ttl: 60000 },
  httpClientAdapter
);

// Mutation
const addUser = createMutation<User, { name: string }>(
  "/api/users",
  { onSuccess: () => users.fetch(true) },
  httpClientAdapter
);
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
