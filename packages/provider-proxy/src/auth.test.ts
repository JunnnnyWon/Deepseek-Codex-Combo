import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildUpstreamHeaders, redactProxyLogValue } from "./auth";
import { createProviderProxyApp, type ProxyRequestContext } from "./server";
import { deepSeekChatCompletionSchema, responsesRequestSchema } from "./types";

const proxyFixtureSchema = z.object({
  chatCompletion: deepSeekChatCompletionSchema,
  request: responsesRequestSchema,
});

const loadFixture = () =>
  proxyFixtureSchema.parse(
    JSON.parse(readFileSync("tests/fixtures/proxy/text-response.json", "utf8")),
  );

describe("provider proxy auth", () => {
  it("authorization_header_is_forwarded_and_redacted", async () => {
    const fixture = loadFixture();
    const seenHeaders: string[] = [];
    const logs: string[] = [];
    const app = createProviderProxyApp({
      chatCompletionProvider: (_request, context: ProxyRequestContext) => {
        seenHeaders.push(context.upstreamHeaders.get("authorization") ?? "");
        return fixture.chatCompletion;
      },
      logSink: (entry) => {
        logs.push(JSON.stringify(entry));
      },
    });

    const response = await app.request("/v1/responses", {
      body: JSON.stringify(fixture.request),
      headers: {
        authorization: "Bearer test-forward-token",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(seenHeaders).toEqual(["Bearer test-forward-token"]);
    expect(logs.join("\n")).not.toContain("test-forward-token");
    expect(logs.join("\n")).toContain("[REDACTED]");
  });

  it("builds_upstream_headers_without_authorization_when_absent", () => {
    const headers = buildUpstreamHeaders(new Headers());

    expect(headers.has("authorization")).toBe(false);
  });

  it("redacts_proxy_log_values", () => {
    const redacted = redactProxyLogValue("Authorization: Bearer test-forward-token", [
      "test-forward-token",
    ]);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("test-forward-token");
  });
});
