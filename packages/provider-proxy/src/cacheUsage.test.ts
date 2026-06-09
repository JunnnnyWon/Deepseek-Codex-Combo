import { describe, expect, it } from "vitest";
import { normalizeDeepSeekUsage } from "./cacheUsage";

describe("normalizeDeepSeekUsage", () => {
  it("normalizes_deepseek_cache_usage", () => {
    const usage = normalizeDeepSeekUsage({
      completion_tokens: 50,
      prompt_cache_hit_tokens: 900,
      prompt_cache_miss_tokens: 100,
      prompt_tokens: 1_000,
      total_tokens: 1_050,
    });

    expect(usage).toEqual({
      completion_tokens: 50,
      prompt_cache_hit_tokens: 900,
      prompt_cache_miss_tokens: 100,
      prompt_tokens: 1_000,
      reasoning_tokens: 0,
      total_tokens: 1_050,
    });
  });

  it("derives_cache_miss_from_nested_cached_tokens", () => {
    const usage = normalizeDeepSeekUsage({
      completion_tokens: 20,
      prompt_tokens: 600,
      prompt_tokens_details: { cached_tokens: 450 },
      total_tokens: 620,
    });

    expect(usage).toMatchObject({
      prompt_cache_hit_tokens: 450,
      prompt_cache_miss_tokens: 150,
    });
  });

  it("preserves_reasoning_tokens_when_reported", () => {
    const usage = normalizeDeepSeekUsage({
      completion_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 17 },
      prompt_cache_hit_tokens: 40,
      prompt_tokens: 100,
      total_tokens: 130,
    });

    expect(usage).toMatchObject({
      prompt_cache_hit_tokens: 40,
      prompt_cache_miss_tokens: 60,
      reasoning_tokens: 17,
    });
  });

  it("returns_undefined_for_absent_usage", () => {
    expect(normalizeDeepSeekUsage(undefined)).toBeUndefined();
    expect(normalizeDeepSeekUsage(null)).toBeUndefined();
  });

  it("normalizes_malformed_numeric_fields_to_zero", () => {
    const usage = normalizeDeepSeekUsage({
      completion_tokens: "bad",
      prompt_cache_hit_tokens: -10,
      prompt_tokens: "also bad",
      total_tokens: 1,
    });

    expect(usage).toEqual({
      completion_tokens: 0,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 0,
      prompt_tokens: 0,
      reasoning_tokens: 0,
      total_tokens: 1,
    });
  });
});
