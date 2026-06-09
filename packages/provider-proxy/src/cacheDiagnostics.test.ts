import { describe, expect, it } from "vitest";
import {
  CACHE_DIAGNOSTIC_REWRITE_VERSION,
  captureCachePrefixShape,
  compareCachePrefixShapes,
} from "./cacheDiagnostics";
import type { DeepSeekChatRequest, DeepSeekTool } from "./types.ts";

const secretTool = (description: string): DeepSeekTool => ({
  function: {
    description,
    name: "secret_lookup",
    parameters: {
      properties: {
        city: { type: "string" },
        unit: { enum: ["celsius", "fahrenheit"], type: "string" },
      },
      required: ["city"],
      type: "object",
    },
  },
  type: "function",
});

describe("cache diagnostics", () => {
  it("captures_hashed_prefix_shape_when_system_messages_and_tools_are_present", () => {
    // Given
    const request: DeepSeekChatRequest = {
      messages: [
        { content: "private system prefix", role: "system" },
        { content: "tail user prompt", role: "user" },
        { content: "second private system prefix", role: "system" },
      ],
      model: "deepseek-v4-pro",
      tools: [secretTool("secret tool schema")],
    };

    // When
    const shape = captureCachePrefixShape(request);

    // Then
    expect(shape).toEqual({
      prefix_hash: expect.stringMatching(/^[0-9a-f]{16}$/),
      rewrite_version: CACHE_DIAGNOSTIC_REWRITE_VERSION,
      system_hash: expect.stringMatching(/^[0-9a-f]{16}$/),
      tool_schema_tokens: expect.any(Number),
      tools_hash: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(shape.tool_schema_tokens).toBeGreaterThan(0);
    expect(JSON.stringify(shape)).not.toContain("private system prefix");
    expect(JSON.stringify(shape)).not.toContain("secret tool schema");
    expect(JSON.stringify(shape)).not.toContain("secret_lookup");
  });

  it("keeps_tool_hash_stable_for_object_key_order_but_not_tool_array_order", () => {
    // Given
    const firstTool: DeepSeekTool = {
      function: {
        name: "first",
        parameters: {
          properties: { zed: { type: "number" }, alpha: { type: "string" } },
          type: "object",
        },
      },
      type: "function",
    };
    const firstToolWithReorderedKeys: DeepSeekTool = {
      function: {
        name: "first",
        parameters: {
          type: "object",
          properties: { alpha: { type: "string" }, zed: { type: "number" } },
        },
      },
      type: "function",
    };
    const secondTool: DeepSeekTool = {
      function: {
        name: "second",
        parameters: { properties: {}, type: "object" },
      },
      type: "function",
    };

    // When
    const canonical = captureCachePrefixShape({
      messages: [],
      model: "deepseek-v4-pro",
      tools: [firstTool, secondTool],
    });
    const reorderedObjectKeys = captureCachePrefixShape({
      messages: [],
      model: "deepseek-v4-pro",
      tools: [firstToolWithReorderedKeys, secondTool],
    });
    const reorderedArray = captureCachePrefixShape({
      messages: [],
      model: "deepseek-v4-pro",
      tools: [secondTool, firstTool],
    });

    // Then
    expect(reorderedObjectKeys.tools_hash).toBe(canonical.tools_hash);
    expect(reorderedObjectKeys.prefix_hash).toBe(canonical.prefix_hash);
    expect(reorderedArray.tools_hash).not.toBe(canonical.tools_hash);
    expect(reorderedArray.prefix_hash).not.toBe(canonical.prefix_hash);
  });

  it("reports_first_observation_without_prefix_change_when_previous_shape_is_missing", () => {
    // Given
    const current = captureCachePrefixShape({
      messages: [{ content: "stable-prefix", role: "system" }],
      model: "deepseek-v4-pro",
      tools: [],
    });

    // When
    const diagnostics = compareCachePrefixShapes(undefined, current, {
      prompt_cache_hit_tokens: 12,
      prompt_cache_miss_tokens: 4,
    });

    // Then
    expect(Object.keys(diagnostics)).toEqual([
      "comparison",
      "prefix_hash",
      "system_hash",
      "tools_hash",
      "rewrite_version",
      "tool_schema_tokens",
      "prefix_changed",
      "prefix_change_reasons",
      "prompt_cache_hit_tokens",
      "prompt_cache_miss_tokens",
    ]);
    expect(diagnostics).toEqual({
      comparison: "first_observation",
      prefix_changed: false,
      prefix_change_reasons: [],
      prefix_hash: current.prefix_hash,
      prompt_cache_hit_tokens: 12,
      prompt_cache_miss_tokens: 4,
      rewrite_version: CACHE_DIAGNOSTIC_REWRITE_VERSION,
      system_hash: current.system_hash,
      tool_schema_tokens: 0,
      tools_hash: current.tools_hash,
    });
  });

  it("reports_changed_reasons_without_raw_prefix_content", () => {
    // Given
    const previous = captureCachePrefixShape({
      messages: [{ content: "old private policy", role: "system" }],
      model: "deepseek-v4-pro",
      tools: [secretTool("old schema secret")],
    });
    const current = captureCachePrefixShape({
      messages: [{ content: "new private policy", role: "system" }],
      model: "deepseek-v4-pro",
      tools: [secretTool("new schema secret")],
    });

    // When
    const diagnostics = compareCachePrefixShapes(previous, current, null);

    // Then
    expect(diagnostics.comparison).toBe("compared");
    expect(diagnostics.prefix_changed).toBe(true);
    expect(diagnostics.prefix_change_reasons).toEqual(["system", "tools"]);
    expect(diagnostics.prompt_cache_hit_tokens).toBe(0);
    expect(diagnostics.prompt_cache_miss_tokens).toBe(0);
    expect(JSON.stringify(diagnostics)).not.toContain("private policy");
    expect(JSON.stringify(diagnostics)).not.toContain("schema secret");
    expect(JSON.stringify(diagnostics)).not.toContain("secret_lookup");
  });

  it("reports_rewrite_change_reason", () => {
    // Given
    const current = captureCachePrefixShape({
      messages: [],
      model: "deepseek-v4-pro",
      tools: [],
    });
    const previous = {
      ...current,
      prefix_hash: "previousprefix00",
      rewrite_version: CACHE_DIAGNOSTIC_REWRITE_VERSION - 1,
    };

    // When
    const diagnostics = compareCachePrefixShapes(previous, current);

    // Then
    expect(diagnostics.comparison).toBe("compared");
    expect(diagnostics.prefix_changed).toBe(true);
    expect(diagnostics.prefix_change_reasons).toEqual(["rewrite"]);
  });

  it("captures_empty_no_tools_shape_and_reports_unchanged_comparison", () => {
    // Given
    const current = captureCachePrefixShape({
      messages: [{ content: "tail only", role: "user" }],
      model: "deepseek-v4-pro",
    });

    // When
    const diagnostics = compareCachePrefixShapes(current, current);

    // Then
    expect(current.tool_schema_tokens).toBe(0);
    expect(diagnostics.comparison).toBe("compared");
    expect(diagnostics.prefix_changed).toBe(false);
    expect(diagnostics.prefix_change_reasons).toEqual([]);
  });
});
