import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const childProcesses: ChildProcessWithoutNullStreams[] = [];
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

const getFreePort = async (): Promise<number> =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("free port server did not bind to tcp");
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });

const waitForReady = async (child: ChildProcessWithoutNullStreams): Promise<string> =>
  new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`proxy did not become ready: ${output}`)),
      5000,
    );
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes("provider-proxy ready")) {
        clearTimeout(timer);
        resolve(output);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`proxy exited early: ${code}; ${output}`));
    });
  });

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    child.kill("SIGTERM");
  }
  const openServers = servers.splice(0);
  await Promise.all(openServers.map((server) => server.close()));
});

describe("dcc proxy live provider wiring", () => {
  it("proxy_start_without_mock_upstream_uses_deepseek_provider", async () => {
    let upstreamCalls = 0;
    const baseUrl = await startMockServer(async (request, response) => {
      upstreamCalls += 1;
      expect(request.method).toBe("POST");
      expect(request.url).toBe("/chat/completions");
      expect(request.headers.authorization).toBe("Bearer sk-test-secret");
      expect(await readRequestBody(request)).toMatchObject({
        model: "deepseek-v4-flash",
      });
      writeJson(response, 200, {
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "proxy ok", role: "assistant" },
          },
        ],
        id: "chatcmpl_proxy_live",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      });
    });
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      ["bin/dcc.mjs", "proxy", "start", "--port", String(port), "--deepseek-base-url", baseUrl],
      {
        cwd: process.cwd(),
        env: { ...process.env, DEEPSEEK_API_KEY: "sk-test-secret" },
      },
    );
    childProcesses.push(child);
    await waitForReady(child);

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      body: JSON.stringify({ input: "hello", model: "deepseek-v4-flash" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as { readonly output_text?: string };

    expect(response.status).toBe(200);
    expect(body.output_text).toBe("proxy ok");
    expect(upstreamCalls).toBe(1);
  });
});
