import { describe, expect, it } from "vitest";
import { formatResponsesSse, mapDeepSeekSseToResponsesEvents } from "./stream";

describe("mapDeepSeekSseToResponsesEvents", () => {
  it("maps_deepseek_sse_to_responses_events", () => {
    const deepSeekSse = [
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"hello ","reasoning_content":"hidden-chain"}}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_diagnostics","arguments":"{\\"path\\":\\"src/index.ts\\"}"}}]}}]}',
      "data: [DONE]",
    ].join("\n\n");

    const events = mapDeepSeekSseToResponsesEvents(deepSeekSse, {
      responseId: "resp_stream",
    });

    expect(events.map((event) => event.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.output_item.added",
      "response.function_call_arguments.delta",
      "response.function_call_arguments.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(JSON.stringify(events)).not.toContain("hidden-chain");
    expect(formatResponsesSse(events)).toContain("event: response.completed");
  });

  it("keeps_the_minimum_event_contract_when_content_reappears_after_tool_calls", () => {
    const deepSeekSse = [
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"hello ","reasoning_content":"hidden-chain"}}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_diagnostics"}}]}}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_1","type":"function","function":{"arguments":"{\\"path\\":\\"src/index.ts\\"}"}}]}}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"ignored tail"}}]}',
      "data: [DONE]",
    ].join("\n\n");

    const events = mapDeepSeekSseToResponsesEvents(deepSeekSse, {
      responseId: "resp_stream",
    });

    expect(events.map((event) => event.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.output_item.added",
      "response.function_call_arguments.delta",
      "response.function_call_arguments.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        delta: "hello ",
        type: "response.output_text.delta",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        arguments: '{"path":"src/index.ts"}',
        type: "response.function_call_arguments.done",
      }),
    );
    expect(JSON.stringify(events)).not.toContain("ignored tail");
  });

  it("maps_stream_usage_chunk", () => {
    const deepSeekSse = [
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"hello ","reasoning_content":"hidden-chain"}}]}',
      'data: {"id":"chatcmpl_stream","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":8,"total_tokens":108,"prompt_cache_hit_tokens":70,"prompt_cache_miss_tokens":30,"completion_tokens_details":{"reasoning_tokens":2}}}',
      "data: [DONE]",
    ].join("\n\n");

    const events = mapDeepSeekSseToResponsesEvents(deepSeekSse, {
      responseId: "resp_stream",
    });

    expect(events.map((event) => event.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.usage",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(events).toContainEqual({
      response_id: "resp_stream",
      type: "response.usage",
      usage: {
        completion_tokens: 8,
        prompt_cache_hit_tokens: 70,
        prompt_cache_miss_tokens: 30,
        prompt_tokens: 100,
        reasoning_tokens: 2,
        total_tokens: 108,
      },
    });
    expect(JSON.stringify(events)).not.toContain("hidden-chain");
    expect(JSON.stringify(events)).not.toContain("reasoning_content");
  });

  it("ignores_reasoning_only_chunks_with_null_content", () => {
    const deepSeekSse = [
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"role":"assistant","content":null,"reasoning_content":""},"finish_reason":null}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":null,"reasoning_content":"hidden-chain"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"DCC_OK","reasoning_content":null},"finish_reason":null}]}',
      "data: [DONE]",
    ].join("\n\n");

    const events = mapDeepSeekSseToResponsesEvents(deepSeekSse, {
      responseId: "resp_stream",
    });

    expect(events.map((event) => event.type)).toEqual([
      "response.created",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        delta: "DCC_OK",
        type: "response.output_text.delta",
      }),
    );
    expect(JSON.stringify(events)).not.toContain("hidden-chain");
  });
});
