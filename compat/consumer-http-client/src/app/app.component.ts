import { HttpClient } from "@angular/common/http";
import { Component, inject, signal } from "@angular/core";
import {
  createQuery,
  createReactiveQuery,
} from "@frontkit-ng/signal-http-cache";

interface CompatPayload {
  ok: boolean;
}

@Component({
  selector: "app-root",
  standalone: true,
  template: `<p>{{ data() ?? reactiveData() ?? loaderValue() ?? "idle" }}</p>`,
})
export class AppComponent {
  private readonly http = inject(HttpClient);

  private readonly query = createQuery<CompatPayload>("/api/compat-http", {
    ttl: 60_000,
    headers: { "X-Compat": "http-client" },
  });

  readonly data = this.query.data;

  private readonly reactiveKey = signal("/api/compat-http-reactive");
  private readonly reactiveQuery = createReactiveQuery<CompatPayload>(
    this.reactiveKey,
    { ttl: 60_000 }
  );

  readonly reactiveData = this.reactiveQuery.data;

  private readonly loaderQuery = createQuery<number>("/api/compat-loader", {
    loader: () => this.http.get<number>("/api/compat-loader"),
  });

  readonly loaderValue = this.loaderQuery.data;
}
