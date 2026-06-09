import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProviderProxyApp } from "./server";
import { deepSeekChatCompletionSchema, responsesRequestSchema } from "./types";

const proxyFixtureSchema = z.object({
  chatCompletion: deepSeekChatCompletionSchema,
  request: responsesRequestSchema,
});

const responseBodySchema = z.object({
  object: z.literal("response"),
  output_text: z.string(),
  status: z.literal("completed"),
  status_event: z.literal("response.completed"),
});

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
  object: z.literal("list"),
});

const healthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("dcc-provider-proxy"),
});

const cacheDiagnosticsSchema = z.object({
  comparison: z.union([
    z.literal("unavailable"),
    z.literal("first_observation"),
    z.literal("compared"),
  ]),
  prefix_changed: z.boolean(),
  prefix_change_reasons: z.array(
    z.union([z.literal("system"), z.literal("tools"), z.literal("rewrite")]),
  ),
});

const responseWithCacheDiagnosticsSchema = z.object({
  cache_diagnostics: cacheDiagnosticsSchema,
  usage: z
    .object({
      prompt_cache_hit_tokens: z.number(),
      prompt_cache_miss_tokens: z.number(),
    })
    .optional(),
});

const loadFixture = () =>
  proxyFixtureSchema.parse(
    JSON.parse(readFileSync("tests/fixtures/proxy/text-response.json", "utf8")),
  );

const chatCompletionWithUsage = () => ({
  choices: [
    {
      finish_reason: "stop",
      index: 0,
      message: {
        content: "Fixture answer.",
        role: "assistant" as const,
      },
    },
  ],
  id: "chatcmpl_usage",
  model: "deepseek-v4-flash",
  object: "chat.completion" as const,
  usage: {
    completion_tokens: 7,
    prompt_cache_hit_tokens: 80,
    prompt_cache_miss_tokens: 20,
    prompt_tokens: 100,
    total_tokens: 107,
  },
});

const requestWithCacheSession = (sessionId: string, instructions = "stable private prompt") => ({
  input: "Summarize.",
  instructions,
  metadata: { dcc_cache_session_id: sessionId },
  model: "deepseek-v4-flash",
});

describe("createProviderProxyApp", () => {
  it("healthz_returns_version_and_models", async () => {
    const app = createProviderProxyApp();

    const response = await app.request("/healthz");
    const body = healthSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.service).toBe("dcc-provider-proxy");
  });

  it("models_falls_back_to_local_catalog", async () => {
    const app = createProviderProxyApp({
      modelsProvider: () => {
        throw new Error("upstream unavailable");
      },
    });

    const response = await app.request("/v1/models");
    const body = modelListSchema.parse(await response.json());
    const modelIds = body.data.map((model) => model.id);

    expect(response.status).toBe(200);
    expect(modelIds).toContain("deepseek-v4-pro");
    expect(modelIds).toContain("deepseek-v4-flash");
  });

  it("responses_transform_returns_completed_response", async () => {
    const fixture = loadFixture();
    const app = createProviderProxyApp({
      chatCompletionProvider: () => fixture.chatCompletion,
    });

    const response = await app.request("/v1/responses", {
      body: JSON.stringify(fixture.request),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = responseBodySchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.status_event).toBe("response.completed");
    expect(body.output_text).toBe("Fixture answer.");
  });

  it("reports_cache_diagnostics_unavailable_without_session_key", async () => {
    const app = createProviderProxyApp({
      chatCompletionProvider: () => chatCompletionWithUsage(),
    });

    const response = await app.request("/v1/responses", {
      body: JSON.stringify({
        input: "No session.",
        model: "deepseek-v4-flash",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = responseWithCacheDiagnosticsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.usage).toMatchObject({
      prompt_cache_hit_tokens: 80,
      prompt_cache_miss_tokens: 20,
    });
    expect(body.cache_diagnostics).toMatchObject({
      comparison: "unavailable",
      prefix_changed: false,
      prefix_change_reasons: [],
    });
  });

  it("reports_cache_prefix_system_change", async () => {
    const app = createProviderProxyApp({
      chatCompletionProvider: () => chatCompletionWithUsage(),
    });

    const first = await app.request("/v1/responses", {
      body: JSON.stringify(requestWithCacheSession("session-system", "first private prompt")),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const second = await app.request("/v1/responses", {
      body: JSON.stringify(requestWithCacheSession("session-system", "second private prompt")),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(
      responseWithCacheDiagnosticsSchema.parse(await first.json()).cache_diagnostics,
    ).toMatchObject({
      comparison: "first_observation",
      prefix_changed: false,
    });
    expect(
      responseWithCacheDiagnosticsSchema.parse(await second.json()).cache_diagnostics,
    ).toMatchObject({
      comparison: "compared",
      prefix_changed: true,
      prefix_change_reasons: ["system"],
    });
  });

  it("reports_cache_prefix_tools_change", async () => {
    const app = createProviderProxyApp({
      chatCompletionProvider: () => chatCompletionWithUsage(),
    });
    const baseRequest = requestWithCacheSession("session-tools");

    const first = await app.request("/v1/responses", {
      body: JSON.stringify({
        ...baseRequest,
        tools: [
          {
            name: "lookup",
            parameters: { properties: {}, type: "object" },
            type: "function",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const second = await app.request("/v1/responses", {
      body: JSON.stringify({
        ...baseRequest,
        tools: [
          {
            description: "private tool schema",
            name: "lookup",
            parameters: { properties: { city: { type: "string" } }, type: "object" },
            type: "function",
          },
        ],
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(
      responseWithCacheDiagnosticsSchema.parse(await first.json()).cache_diagnostics,
    ).toMatchObject({
      comparison: "first_observation",
    });
    expect(
      responseWithCacheDiagnosticsSchema.parse(await second.json()).cache_diagnostics,
    ).toMatchObject({
      comparison: "compared",
      prefix_changed: true,
      prefix_change_reasons: ["tools"],
    });
  });

  it("cache_diagnostics_do_not_leak_sensitive_content", async () => {
    const logs: string[] = [];
    const app = createProviderProxyApp({
      chatCompletionProvider: () => chatCompletionWithUsage(),
      logSink: (entry) => logs.push(JSON.stringify(entry)),
    });

    const response = await app.request("/v1/responses", {
      body: JSON.stringify({
        ...requestWithCacheSession("session-redaction", "private prompt do not leak"),
        tools: [
          {
            description: "private tool schema",
            name: "lookup",
            parameters: { properties: { secret: { type: "string" } }, type: "object" },
            type: "function",
          },
        ],
      }),
      headers: {
        authorization: "Bearer sk-cache-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });
    const serialized = `${JSON.stringify(await response.json())}\n${logs.join("\n")}`;

    expect(serialized).toContain("cache_diagnostics");
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("private tool schema");
    expect(serialized).not.toContain("sk-cache-secret");
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("reasoning_content");
  });
});
