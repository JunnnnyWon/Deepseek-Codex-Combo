import { describe, expect, it } from "vitest";
import { createReasoningStore } from "./reasoningStore";

describe("createReasoningStore", () => {
  it("stores_reasoning_only_in_memory_per_session", () => {
    let nowMs = 1_000;
    const store = createReasoningStore({
      maxEntries: 1,
      now: () => nowMs,
      ttlMs: 100,
    });

    const first = store.put({
      reasoningContent: "hidden-chain-session-a",
      sessionId: "session-a",
      turnId: "turn-1",
    });

    expect(store.get({ reference: first.reference, sessionId: "session-a" })).toBe(
      "hidden-chain-session-a",
    );
    expect(store.get({ reference: first.reference, sessionId: "session-b" })).toBeUndefined();
    expect(JSON.stringify(store.snapshot())).not.toContain("hidden-chain-session-a");

    nowMs = 1_200;
    expect(store.get({ reference: first.reference, sessionId: "session-a" })).toBeUndefined();

    const second = store.put({
      reasoningContent: "hidden-chain-two",
      sessionId: "session-a",
      turnId: "turn-2",
    });
    store.put({
      reasoningContent: "hidden-chain-three",
      sessionId: "session-a",
      turnId: "turn-3",
    });

    expect(store.get({ reference: second.reference, sessionId: "session-a" })).toBeUndefined();
  });

  it("keeps_concurrent_entries_isolated_within_a_session", () => {
    const store = createReasoningStore({
      maxEntries: 4,
      now: () => 1_000,
      ttlMs: 100,
    });

    const first = store.put({
      reasoningContent: "hidden-chain-one",
      sessionId: "session-a",
      turnId: "turn-1",
    });
    const second = store.put({
      reasoningContent: "hidden-chain-two",
      sessionId: "session-a",
      turnId: "turn-1",
    });

    expect(first.reference).not.toBe(second.reference);
    expect(store.get({ reference: first.reference, sessionId: "session-a" })).toBe(
      "hidden-chain-one",
    );
    expect(store.get({ reference: second.reference, sessionId: "session-a" })).toBe(
      "hidden-chain-two",
    );
    expect(store.size()).toBe(2);
  });

  it("evicts_least_recently_used_across_sessions", () => {
    let nowMs = 1_000;
    const store = createReasoningStore({
      maxEntries: 2,
      now: () => nowMs,
      ttlMs: 10_000,
    });

    const first = store.put({
      reasoningContent: "hidden-chain-a",
      sessionId: "session-a",
      turnId: "turn-1",
    });
    nowMs += 1;
    const second = store.put({
      reasoningContent: "hidden-chain-b",
      sessionId: "session-a",
      turnId: "turn-2",
    });
    nowMs += 1;
    const third = store.put({
      reasoningContent: "hidden-chain-c",
      sessionId: "session-b",
      turnId: "turn-3",
    });

    expect(store.size()).toBe(2);
    expect(store.get({ reference: third.reference, sessionId: "session-b" })).toBe(
      "hidden-chain-c",
    );
    expect(store.get({ reference: second.reference, sessionId: "session-a" })).toBe(
      "hidden-chain-b",
    );
    expect(store.get({ reference: first.reference, sessionId: "session-a" })).toBeUndefined();
  });

  it("removes_all_session_entries_during_cleanup", () => {
    const store = createReasoningStore({
      maxEntries: 4,
      now: () => 1_000,
      ttlMs: 100,
    });

    const sessionA = store.put({
      reasoningContent: "hidden-chain-session-a",
      sessionId: "session-a",
      turnId: "turn-1",
    });
    const sessionB = store.put({
      reasoningContent: "hidden-chain-session-b",
      sessionId: "session-b",
      turnId: "turn-1",
    });

    store.cleanupSession("session-a");

    expect(store.get({ reference: sessionA.reference, sessionId: "session-a" })).toBeUndefined();
    expect(store.get({ reference: sessionB.reference, sessionId: "session-b" })).toBe(
      "hidden-chain-session-b",
    );
    expect(store.snapshot()).toEqual([
      {
        expiresAtMs: 1_100,
        reference: sessionB.reference,
        sessionId: "session-b",
        turnId: "turn-1",
      },
    ]);
  });
});
