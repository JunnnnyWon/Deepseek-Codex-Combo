import { describe, expect, it } from "vitest";
import { mapDeepSeekError } from "./errors";

describe("mapDeepSeekError", () => {
  it("maps_upstream_errors_to_codex_errors", () => {
    expect(mapDeepSeekError({ message: "bad key", status: 401 })).toEqual({
      kind: "auth_error",
      message: "DEEPSEEK_API_KEY check failed: bad key",
      retryable: false,
      status: 401,
    });

    expect(mapDeepSeekError({ message: "missing model", status: 404 })).toEqual({
      kind: "model_not_found",
      message: "DeepSeek model not found: missing model",
      retryable: false,
      status: 404,
    });

    expect(mapDeepSeekError({ message: "slow down", retryAfterSeconds: 30, status: 429 })).toEqual({
      kind: "rate_limit_error",
      message: "DeepSeek rate limit: slow down",
      retryAfterSeconds: 30,
      retryable: true,
      status: 429,
    });

    expect(mapDeepSeekError({ message: "gateway", status: 503 })).toEqual({
      kind: "upstream_error",
      message: "DeepSeek upstream error: gateway",
      retryable: true,
      status: 503,
    });
  });

  it("maps_reasoning_and_tool_schema_errors", () => {
    expect(mapDeepSeekError({ message: "reasoning_content missing", status: 400 })).toEqual({
      kind: "adapter_error",
      message: "DeepSeek reasoning continuation bug: reasoning continuation missing",
      retryable: false,
      status: 400,
    });
    expect(
      mapDeepSeekError({ message: "reasoning_content missing", status: 400 }).message,
    ).not.toContain("reasoning_content");

    expect(
      mapDeepSeekError({ code: "tool_schema_error", message: "bad schema", status: 400 }),
    ).toEqual({
      kind: "tool_schema_error",
      message: "DeepSeek tool schema rejected: bad schema",
      retryable: false,
      status: 400,
    });
  });
});
