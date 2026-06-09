import { describe, expect, it } from "vitest";
import { convertChatCompletionToResponses, type DeepSeekChatCompletion } from "./chatToResponses";

describe("convertChatCompletionToResponses", () => {
  it("converts_text_message_to_output_text", () => {
    const chatCompletion = {
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: {
            content: "Fixture answer.",
            role: "assistant",
          },
        },
      ],
      id: "chatcmpl_text",
      model: "deepseek-v4-flash",
      object: "chat.completion",
    } satisfies DeepSeekChatCompletion;

    const response = convertChatCompletionToResponses(chatCompletion);

    expect(response).toMatchObject({
      id: "resp_chatcmpl_text",
      model: "deepseek-v4-flash",
      object: "response",
      output_text: "Fixture answer.",
      status: "completed",
    });
    expect(response.output).toEqual([
      {
        content: [{ text: "Fixture answer.", type: "output_text" }],
        role: "assistant",
        type: "message",
      },
    ]);
  });

  it("converts_tool_call_to_function_call_item", () => {
    const chatCompletion = {
      choices: [
        {
          finish_reason: "tool_calls",
          index: 0,
          message: {
            content: null,
            role: "assistant",
            tool_calls: [
              {
                function: {
                  arguments: '{"path":"src/index.ts"}',
                  name: "get_diagnostics",
                },
                id: "call_123",
                type: "function",
              },
            ],
          },
        },
      ],
      id: "chatcmpl_tool",
      model: "deepseek-v4-pro",
      object: "chat.completion",
    } satisfies DeepSeekChatCompletion;

    const response = convertChatCompletionToResponses(chatCompletion);

    expect(response.status).toBe("completed");
    expect(response.output).toEqual([
      {
        arguments: '{"path":"src/index.ts"}',
        call_id: "call_123",
        name: "get_diagnostics",
        type: "function_call",
      },
    ]);
  });

  it("includes_cache_usage", () => {
    const chatCompletion = {
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: {
            content: "Usage fixture.",
            role: "assistant",
          },
        },
      ],
      id: "chatcmpl_usage",
      model: "deepseek-v4-flash",
      object: "chat.completion",
      usage: {
        completion_tokens: 7,
        completion_tokens_details: { reasoning_tokens: 3 },
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20,
        prompt_tokens: 100,
        total_tokens: 107,
      },
    } satisfies DeepSeekChatCompletion;

    const response = convertChatCompletionToResponses(chatCompletion);

    expect(response.usage).toEqual({
      completion_tokens: 7,
      prompt_cache_hit_tokens: 80,
      prompt_cache_miss_tokens: 20,
      prompt_tokens: 100,
      reasoning_tokens: 3,
      total_tokens: 107,
    });
  });
});
