import { describe, expect, it } from "vitest";
import { createBoundedStore } from "./bounded-store";

describe("createBoundedStore", () => {
  it("evicts expired entries by session", () => {
    let now = 1_000;
    const store = createBoundedStore<string>({
      maxEntriesPerSession: 2,
      now: () => now,
      ttlMs: 500,
    });

    store.set("session-a", "reasoning", "a1");
    store.set("session-b", "reasoning", "b1");

    expect(store.get("session-a", "reasoning")).toBe("a1");
    expect(store.get("session-b", "reasoning")).toBe("b1");

    now += 501;
    store.purgeExpired();

    expect(store.get("session-a", "reasoning")).toBeUndefined();
    expect(store.get("session-b", "reasoning")).toBeUndefined();
  });

  it("evicts oldest entries per session when capacity is exceeded", () => {
    let now = 2_000;
    const store = createBoundedStore<string>({
      maxEntriesPerSession: 2,
      now: () => now,
      ttlMs: 10_000,
    });

    store.set("session-a", "first", "a1");
    now += 1;
    store.set("session-a", "second", "a2");
    now += 1;
    store.set("session-a", "third", "a3");
    store.set("session-b", "first", "b1");

    expect(store.get("session-a", "first")).toBeUndefined();
    expect(store.get("session-a", "second")).toBe("a2");
    expect(store.get("session-a", "third")).toBe("a3");
    expect(store.get("session-b", "first")).toBe("b1");
  });
});
