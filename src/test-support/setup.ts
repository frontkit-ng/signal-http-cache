import { beforeEach } from "vitest";
import { cacheStore } from "../cache-store";

beforeEach(() => {
  cacheStore.clear();
});
