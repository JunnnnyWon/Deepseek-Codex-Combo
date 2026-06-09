import { describe, expect, it } from "vitest";
import { planJsonRepair, planRetry, planStreamRetry, planToolCallLoop } from "./retry";

describe("planRetry", () => {
  it("retries_429_with_jitter_and_caps_attempts", () => {
    expect(
      planRetry({
        attempt: 1,
        baseDelayMs: 100,
        jitterRatio: 0.5,
        maxAttempts: 3,
        maxDelayMs: 1_000,
        random: () => 0.5,
        status: 429,
      }),
    ).toEqual({
      action: "retry",
      delayMs: 100,
      reason: "rate_limit",
    });

    expect(
      planRetry({
        attempt: 3,
        baseDelayMs: 100,
        jitterRatio: 0.5,
        maxAttempts: 3,
        maxDelayMs: 1_000,
        random: () => 0.5,
        status: 429,
      }),
    ).toEqual({
      action: "give_up",
      reason: "attempt_cap",
    });
  });

  it("retries_5xx_and_caps_stream_interruptions", () => {
    expect(
      planRetry({
        attempt: 1,
        baseDelayMs: 80,
        jitterRatio: 0.2,
        maxAttempts: 2,
        maxDelayMs: 2_000,
        random: () => 0.5,
        status: 500,
      }),
    ).toEqual({
      action: "retry",
      reason: "upstream",
      delayMs: 80,
    });

    expect(
      planStreamRetry({
        attempt: 1,
        baseDelayMs: 80,
        jitterRatio: 0.2,
        maxAttempts: 3,
        maxDelayMs: 120,
        random: () => 0.5,
        retryAfterMs: 175,
      }),
    ).toEqual({
      action: "retry",
      delayMs: 175,
      reason: "stream_interruption",
    });

    expect(
      planStreamRetry({
        attempt: 2,
        baseDelayMs: 80,
        jitterRatio: 0.2,
        maxAttempts: 2,
        maxDelayMs: 2_000,
        random: () => 0.5,
      }),
    ).toEqual({
      action: "give_up",
      reason: "attempt_cap",
    });
  });

  it("retries_json_once_then_gives_up", () => {
    expect(
      planJsonRepair({
        attempts: 1,
        maxAttempts: 2,
      }),
    ).toEqual({
      action: "retry",
      reason: "json_repair",
    });

    expect(
      planJsonRepair({
        attempts: 2,
        maxAttempts: 2,
      }),
    ).toEqual({
      action: "give_up",
      reason: "attempt_cap",
    });
  });

  it("caps_5xx_backoff_and_prefers_retry_after", () => {
    expect(
      planRetry({
        attempt: 2,
        baseDelayMs: 100,
        jitterRatio: 0.5,
        maxAttempts: 4,
        maxDelayMs: 150,
        random: () => 1,
        status: 503,
      }),
    ).toEqual({
      action: "retry",
      delayMs: 150,
      reason: "upstream",
    });

    expect(
      planRetry({
        attempt: 2,
        baseDelayMs: 100,
        jitterRatio: 0.5,
        maxAttempts: 4,
        maxDelayMs: 150,
        random: () => 0,
        retryAfterMs: 275,
        status: 429,
      }),
    ).toEqual({
      action: "retry",
      delayMs: 275,
      reason: "rate_limit",
    });
  });

  it("handoffs_tool_call_retries_after_three_attempts", () => {
    expect(
      planToolCallLoop({
        attempt: 2,
        maxAttempts: 3,
      }),
    ).toEqual({
      action: "retry",
      reason: "tool_call_loop",
    });

    expect(
      planToolCallLoop({
        attempt: 3,
        maxAttempts: 3,
      }),
    ).toEqual({
      action: "handoff",
      reason: "tool_call_loop",
    });
  });

  it("rejects_invalid_attempt_counters", () => {
    expect(() =>
      planRetry({
        attempt: 0,
        baseDelayMs: 100,
        jitterRatio: 0.5,
        maxAttempts: 3,
        maxDelayMs: 1_000,
        random: () => 0.5,
        status: 429,
      }),
    ).toThrow("attempt must be a positive integer");

    expect(() =>
      planStreamRetry({
        attempt: -1,
        baseDelayMs: 80,
        jitterRatio: 0.2,
        maxAttempts: 2,
        maxDelayMs: 2_000,
        random: () => 0.5,
      }),
    ).toThrow("attempt must be a positive integer");

    expect(() =>
      planJsonRepair({
        attempts: 0,
        maxAttempts: 2,
      }),
    ).toThrow("attempts must be a positive integer");

    expect(() =>
      planToolCallLoop({
        attempt: 1,
        maxAttempts: 0,
      }),
    ).toThrow("maxAttempts must be a positive integer");
  });
});
