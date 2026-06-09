import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDeepSeekChatCompletionProvider,
  createDeepSeekModelListProvider,
  DeepSeekProviderError,
} from "./deepseekProvider";

const servers: Array<{ readonly close: () => Promise<void> }> = [];

const readRequestBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const writeJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const startMockServer = async (
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void,
): Promise<string> =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      void handler(request, response);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("mock server did not bind to tcp");
      }
      servers.push({
        close: () =>
          new Promise((closeResolve) => {
            server.close(() => closeResolve());
          }),
      });
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

afterEach(async () => {
  const openServers = servers.splice(0);
  await Promise.all(openServers.map((server) => server.close()));
});

describe("createDeepSeekChatCompletionProvider", () => {
  it("posts_chat_completions_with_forwarded_authorization", async () => {
    const baseUrl = await startMockServer(async (request, response) => {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/chat/completions");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(request.headers["content-type"]).toContain("application/json");
      expect(await readRequestBody(request)).toMatchObject({
        model: "deepseek-v4-flash",
      });

      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "ok", role: "assistant" },
          },
        ],
        id: "chatcmpl_mock",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      });
    });
    const provider = createDeepSeekChatCompletionProvider({ baseUrl });

    const result = await provider(
      { messages: [{ content: "hello", role: "user" }], model: "deepseek-v4-flash" },
      { upstreamHeaders: new Headers({ authorization: "Bearer sk-test-secret" }) },
    );

    expect(result.id).toBe("chatcmpl_mock");
  });

  it("defaults_outgoing_chat_requests_to_thinking_disabled", async () => {
    let capturedBody: unknown;
    const baseUrl = await startMockServer(async (request, response) => {
      capturedBody = await readRequestBody(request);

      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "ok", role: "assistant" },
          },
        ],
        id: "chatcmpl_thinking_disabled",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      });
    });
    const provider = createDeepSeekChatCompletionProvider({ baseUrl });

    const result = await provider(
      { messages: [{ content: "hello", role: "user" }], model: "deepseek-v4-flash" },
      { upstreamHeaders: new Headers() },
    );

    expect(result.id).toBe("chatcmpl_thinking_disabled");
    expect(capturedBody).toMatchObject({
      thinking: { type: "disabled" },
    });
  });

  it("preserves_explicit_thinking_enabled_requests", async () => {
    let capturedBody: unknown;
    const baseUrl = await startMockServer(async (request, response) => {
      capturedBody = await readRequestBody(request);

      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "ok", role: "assistant" },
          },
        ],
        id: "chatcmpl_thinking_enabled",
        model: "deepseek-v4-pro",
        object: "chat.completion",
      });
    });
    const provider = createDeepSeekChatCompletionProvider({ baseUrl });

    const result = await provider(
      {
        messages: [{ content: "hello", role: "user" }],
        model: "deepseek-v4-pro",
        reasoning_effort: "max",
        thinking: { type: "enabled" },
      },
      { upstreamHeaders: new Headers() },
    );

    expect(result.id).toBe("chatcmpl_thinking_enabled");
    expect(capturedBody).toMatchObject({
      reasoning_effort: "max",
      thinking: { type: "enabled" },
    });
  });

  it("maps_auth_errors_without_leaking_authorization", async () => {
    const baseUrl = await startMockServer((_request, response) => {
      writeJson(response, 401, { error: { message: "bad key sk-test-secret" } });
    });
    const provider = createDeepSeekChatCompletionProvider({ baseUrl });

    await expect(
      provider(
        { messages: [{ content: "hello", role: "user" }], model: "deepseek-v4-flash" },
        { upstreamHeaders: new Headers({ authorization: "Bearer sk-test-secret" }) },
      ),
    ).rejects.toMatchObject({
      code: "auth_error",
      status: 401,
    });
    try {
      await provider(
        { messages: [{ content: "hello", role: "user" }], model: "deepseek-v4-flash" },
        { upstreamHeaders: new Headers({ authorization: "Bearer sk-test-secret" }) },
      );
      throw new Error("expected provider to reject");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DeepSeekProviderError);
      expect(error instanceof Error ? error.message : "").not.toContain("sk-test-secret");
    }
  });

  it("retries_429_and_5xx_with_bounded_attempts", async () => {
    let attempts = 0;
    const baseUrl = await startMockServer((_request, response) => {
      attempts += 1;
      if (attempts < 3) {
        writeJson(response, 429, { error: { message: "slow down" } });
        return;
      }

      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "ok", role: "assistant" },
          },
        ],
        id: "chatcmpl_retry",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      });
    });
    const provider = createDeepSeekChatCompletionProvider({
      baseUrl,
      maxAttempts: 3,
      sleep: () => Promise.resolve(),
    });

    const result = await provider(
      { messages: [{ content: "hello", role: "user" }], model: "deepseek-v4-flash" },
      { upstreamHeaders: new Headers() },
    );

    expect(result.id).toBe("chatcmpl_retry");
    expect(attempts).toBe(3);
  });
});

describe("createDeepSeekModelListProvider", () => {
  it("fetches_models_from_upstream", async () => {
    const baseUrl = await startMockServer((_request, response) => {
      writeJson(response, 200, {
        data: [{ id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" }],
        object: "list",
      });
    });
    const provider = createDeepSeekModelListProvider({
      baseUrl,
      upstreamHeaders: new Headers({ authorization: "Bearer sk-test-secret" }),
    });

    await expect(provider()).resolves.toEqual([
      { id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" },
    ]);
  });
});
