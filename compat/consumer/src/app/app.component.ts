import { Component } from "@angular/core";
import { createMutation, createQuery } from "@frontkit-ng/signal-http-cache";

interface CompatPayload {
  ok: boolean;
}

@Component({
  selector: "app-root",
  standalone: true,
  template: `<p>{{ data() ?? "idle" }}</p>`,
})
export class AppComponent {
  private readonly query = createQuery<CompatPayload>("/api/compat", {
    ttl: 60_000,
    staleWhileRevalidate: true,
    headers: { "X-Compat": "1" },
  });

  readonly data = this.query.data;

  readonly deleteMutation = createMutation<void, number>(
    (id) => `/api/items/${id}`,
    {
      method: "DELETE",
      invalidateKeys: ["/api/compat"],
    }
  );
}
