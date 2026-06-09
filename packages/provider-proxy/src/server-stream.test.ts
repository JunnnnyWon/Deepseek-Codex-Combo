import { describe, expect, it } from "vitest";
import { createProviderProxyApp } from "./server";

const streamFixture = [
  'data: {"id":"chatcmpl_stream","choices":[{"index":0,"delta":{"content":"hello ","reasoning_content":"hidden-chain"}}]}',
  'data: {"id":"chatcmpl_stream","choices":[],"usage":{"prompt_tokens":100,"completion_tokens":8,"total_tokens":108,"prompt_cache_hit_tokens":70,"prompt_cache_miss_tokens":30,"completion_tokens_details":{"reasoning_tokens":2}}}',
  "data: [DONE]",
].join("\n\n");

describe("provider proxy streaming endpoints", () => {
  it("chat_completions_endpoint_is_explicit_and_never_echoes_request", async () => {
    const app = createProviderProxyApp();

    const response = await app.request("/v1/chat/completions", {
      body: JSON.stringify({ sentinel: "do-not-echo-chat-completions" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.status).toBe(501);
    expect(body).toContain("unsupported_endpoint");
    expect(body).not.toContain("do-not-echo-chat-completions");
  });

  it("responses_stream_mode_emits_responses_sse_with_usage_without_reasoning", async () => {
    const app = createProviderProxyApp({
      chatCompletionStreamProvider: () => streamFixture,
    });

    const response = await app.request("/v1/responses", {
      body: JSON.stringify({
        input: "stream please",
        model: "deepseek-v4-flash",
        stream: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: response.output_text.delta");
    expect(body).toContain("event: response.usage");
    expect(body.indexOf("event: response.usage")).toBeLessThan(
      body.indexOf("event: response.completed"),
    );
    expect(body).not.toContain("hidden-chain");
    expect(body).not.toContain("reasoning_content");
  });
});
