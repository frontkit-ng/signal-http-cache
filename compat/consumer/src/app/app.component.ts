import { Component, signal } from "@angular/core";
import { createMutation, createQuery, createReactiveQuery } from "@frontkit-ng/signal-http-cache";

interface CompatPayload {
  ok: boolean;
}

@Component({
  selector: "app-root",
  standalone: true,
  template: `<p>{{ data() ?? reactiveData() ?? "idle" }}</p>`,
})
export class AppComponent {
  private readonly query = createQuery<CompatPayload>("/api/compat", {
    ttl: 60_000,
    staleWhileRevalidate: true,
    headers: { "X-Compat": "1" },
  });

  readonly data = this.query.data;

  private readonly reactiveKey = signal("/api/compat-reactive");
  private readonly reactiveQuery = createReactiveQuery<CompatPayload>(
    this.reactiveKey,
    { ttl: 60_000 }
  );

  readonly reactiveData = this.reactiveQuery.data;

  readonly deleteMutation = createMutation<void, number>(
    (id) => `/api/items/${id}`,
    {
      method: "DELETE",
      invalidateKeys: ["/api/compat"],
    }
  );
}
