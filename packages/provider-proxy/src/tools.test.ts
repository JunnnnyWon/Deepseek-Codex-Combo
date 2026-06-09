import { describe, expect, it } from "vitest";
import { createReasoningStore } from "./reasoningStore";
import {
  buildToolContinuationMessages,
  summarizeToolContinuationForEvidence,
  ToolContinuationError,
} from "./tools";

describe("buildToolContinuationMessages", () => {
  it("continues_tool_call_with_reasoning_content", () => {
    const reasoningStore = createReasoningStore({
      maxEntries: 4,
      now: () => 1_000,
      ttlMs: 10_000,
    });
    const stored = reasoningStore.put({
      reasoningContent: "hidden-chain-for-upstream-only",
      sessionId: "session-a",
      turnId: "turn-1",
    });

    const messages = buildToolContinuationMessages({
      reasoningReference: stored.reference,
      reasoningStore,
      sessionId: "session-a",
      toolCallId: "call_123",
      toolName: "get_diagnostics",
      toolResult: "diagnostics ok",
    });

    expect(messages[0]).toMatchObject({
      reasoning_content: "hidden-chain-for-upstream-only",
      role: "assistant",
    });
    expect(messages[1]).toEqual({
      content: "diagnostics ok",
      role: "tool",
      tool_call_id: "call_123",
    });
    expect(summarizeToolContinuationForEvidence(messages)).not.toContain(
      "hidden-chain-for-upstream-only",
    );
  });

  it("throws_when_reasoning_reference_is_missing", () => {
    const reasoningStore = createReasoningStore({
      maxEntries: 4,
      now: () => 1_000,
      ttlMs: 10_000,
    });

    expect(() =>
      buildToolContinuationMessages({
        reasoningReference: "rsn_missing",
        reasoningStore,
        sessionId: "session-a",
        toolCallId: "call_123",
        toolName: "get_diagnostics",
        toolResult: "diagnostics ok",
      }),
    ).toThrowError(ToolContinuationError);
  });

  it("throws_when_reasoning_reference_is_expired_without_raw_reasoning", () => {
    let nowMs = 1_000;
    const reasoningStore = createReasoningStore({
      maxEntries: 4,
      now: () => nowMs,
      ttlMs: 10,
    });
    const stored = reasoningStore.put({
      reasoningContent: "hidden-expired-chain",
      sessionId: "session-a",
      turnId: "turn-1",
    });
    nowMs = 1_100;

    expect(() =>
      buildToolContinuationMessages({
        reasoningReference: stored.reference,
        reasoningStore,
        sessionId: "session-a",
        toolCallId: "call_123",
        toolName: "get_diagnostics",
        toolResult: "diagnostics ok",
      }),
    ).toThrowError(ToolContinuationError);
    try {
      buildToolContinuationMessages({
        reasoningReference: stored.reference,
        reasoningStore,
        sessionId: "session-a",
        toolCallId: "call_123",
        toolName: "get_diagnostics",
        toolResult: "diagnostics ok",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain("hidden-expired-chain");
      expect(message).not.toContain("reasoning_content");
    }
  });
});
