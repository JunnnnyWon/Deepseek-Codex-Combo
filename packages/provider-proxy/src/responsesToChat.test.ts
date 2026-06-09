import { describe, expect, it } from "vitest";
import {
  convertResponsesRequestToChat,
  type ResponsesRequest,
  ToolSchemaError,
} from "./responsesToChat";

describe("convertResponsesRequestToChat", () => {
  it("accepts_codex_0_130_payload_shape", () => {
    const request = {
      client_metadata: { "x-codex-installation-id": "install-redacted" },
      include: [],
      input: [
        {
          content: [
            { text: "Developer instructions.", type: "input_text" },
            { text: "More setup.", type: "input_text" },
          ],
          role: "developer",
          type: "message",
        },
        {
          content: [{ text: "Say OK only.", type: "input_text" }],
          role: "user",
          type: "message",
        },
      ],
      model: "deepseek-v4-pro",
      parallel_tool_calls: true,
      prompt_cache_key: "cache-redacted",
      reasoning: null,
      store: false,
      stream: true,
      tool_choice: "auto",
      tools: [
        {
          description: "Run a command.",
          name: "exec_command",
          parameters: {
            additionalProperties: false,
            properties: { cmd: { type: "string" } },
            required: ["cmd"],
            type: "object",
          },
          strict: true,
          type: "function",
        },
        {
          type: "web_search",
        },
      ],
    };

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest).toMatchObject({
      messages: [
        { content: "Developer instructions.More setup.", role: "system" },
        { content: "Say OK only.", role: "user" },
      ],
      model: "deepseek-v4-pro",
      stream: true,
      thinking: { type: "disabled" },
      tool_choice: "auto",
      tools: [
        {
          function: {
            name: "exec_command",
            parameters: {
              additionalProperties: false,
              properties: { cmd: { type: "string" } },
              required: ["cmd"],
              type: "object",
            },
          },
          type: "function",
        },
      ],
    });
    expect(result.warnings.map((warning) => warning.code)).toContain("unsupported_tool_dropped");
  });

  it("converts_string_input_to_user_message", () => {
    const request = {
      input: "Summarize the fixture behavior.",
      metadata: { trace_id: "local-trace-1" },
      model: "deepseek-v4-flash",
      stream: false,
    } satisfies ResponsesRequest;

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest).toEqual({
      messages: [{ content: "Summarize the fixture behavior.", role: "user" }],
      model: "deepseek-v4-flash",
      stream: false,
      thinking: { type: "disabled" },
    });
    expect(result.warnings).toEqual([]);
    expect(JSON.stringify(result.chatRequest)).not.toContain("local-trace-1");
    expect(JSON.stringify(result.chatRequest)).not.toContain("metadata");
  });

  it("defaults_to_thinking_disabled_without_reasoning_opt_in", () => {
    const request = {
      input: "Reply with a short smoke token.",
      model: "deepseek-v4-flash",
    } satisfies ResponsesRequest;

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest).toMatchObject({
      model: "deepseek-v4-flash",
      thinking: { type: "disabled" },
    });
    expect(JSON.stringify(result.chatRequest)).not.toContain("reasoning_effort");
  });

  it("drops_thinking_ignored_sampling_params", () => {
    const request = {
      input: "Plan the change.",
      model: "deepseek-v4-pro",
      parallel_tool_calls: true,
      reasoning: { effort: "xhigh" },
      temperature: 0.7,
      top_p: 0.9,
    } satisfies ResponsesRequest;

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest).toEqual({
      messages: [{ content: "Plan the change.", role: "user" }],
      model: "deepseek-v4-pro",
      reasoning_effort: "max",
      thinking: { type: "enabled" },
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "temperature_dropped_for_thinking",
      "top_p_dropped_for_thinking",
      "parallel_tool_calls_dropped",
    ]);
  });

  it("converts_function_tools_to_chat_tools", () => {
    const request = {
      input: "Use a tool if needed.",
      model: "deepseek-v4-pro",
      tools: [
        {
          description: "Read diagnostics",
          name: "get_diagnostics",
          parameters: {
            additionalProperties: false,
            properties: { path: { type: "string" } },
            required: ["path"],
            type: "object",
          },
          type: "function",
        },
      ],
    } satisfies ResponsesRequest;

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest.tools).toEqual([
      {
        function: {
          description: "Read diagnostics",
          name: "get_diagnostics",
          parameters: {
            additionalProperties: false,
            properties: { path: { type: "string" } },
            required: ["path"],
            type: "object",
          },
        },
        type: "function",
      },
    ]);
  });

  it("converts_codex_function_call_history_to_chat_tool_messages", () => {
    const request = {
      input: [
        {
          content: [{ text: "Inspect the project.", type: "input_text" }],
          role: "user",
          type: "message",
        },
        {
          content: [{ text: "I'll inspect the structure.", type: "output_text" }],
          role: "assistant",
          type: "message",
        },
        {
          arguments: '{"cmd":"find . -maxdepth 2"}',
          call_id: "call_1",
          name: "exec_command",
          type: "function_call",
        },
        {
          call_id: "call_1",
          output: ".\n./packages\n",
          type: "function_call_output",
        },
      ],
      model: "deepseek-v4-pro",
      reasoning: null,
    };

    const result = convertResponsesRequestToChat(request);

    expect(result.chatRequest.messages).toEqual([
      { content: "Inspect the project.", role: "user" },
      { content: "I'll inspect the structure.", role: "assistant" },
      {
        content: "",
        role: "assistant",
        tool_calls: [
          {
            function: { arguments: '{"cmd":"find . -maxdepth 2"}', name: "exec_command" },
            id: "call_1",
            type: "function",
          },
        ],
      },
      { content: ".\n./packages\n", role: "tool", tool_call_id: "call_1" },
    ]);
  });

  it("rejects_invalid_tool_schema_before_upstream", () => {
    const request = {
      input: "Use a bad tool.",
      model: "deepseek-v4-pro",
      tools: [
        {
          name: "bad_tool",
          parameters: { type: "array" },
          type: "function",
        },
      ],
    } satisfies ResponsesRequest;

    expect(() => convertResponsesRequestToChat(request)).toThrow(ToolSchemaError);
  });
});
