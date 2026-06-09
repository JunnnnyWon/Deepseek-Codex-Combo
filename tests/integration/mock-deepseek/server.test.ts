import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

const readyPattern = /mock-deepseek ready (http:\/\/127\.0\.0\.1:\d+)/;

const waitForReady = (server: ChildProcessByStdio<null, Readable, Readable>): Promise<string> =>
  new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const cleanup = (): void => {
      clearTimeout(timeout);
      server.stdout.off("data", onStdout);
      server.stderr.off("data", onStderr);
      server.off("exit", onExit);
    };

    const onStdout = (chunk: Buffer): void => {
      stdout += chunk.toString("utf8");
      const match = readyPattern.exec(stdout);
      const url = match?.[1];
      if (url !== undefined) {
        cleanup();
        resolve(url);
      }
    };

    const onStderr = (chunk: Buffer): void => {
      stderr += chunk.toString("utf8");
    };

    const onExit = (code: number | null): void => {
      cleanup();
      reject(new Error(`mock server exited before ready: ${code ?? "signal"} ${stderr}`));
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`mock server did not become ready: ${stdout} ${stderr}`));
    }, 5_000);

    server.stdout.on("data", onStdout);
    server.stderr.on("data", onStderr);
    server.once("exit", onExit);
  });

describe("mock DeepSeek server", () => {
  it("mock_server_serves_chat_stream_and_tool_fixtures", async () => {
    const server = spawn("node", ["tests/fixtures/mock-deepseek/server.mjs", "--port", "0"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      const baseUrl = await waitForReady(server);

      const health = await fetch(`${baseUrl}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.text()).toContain("ok");

      const toolResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        body: JSON.stringify({
          messages: [{ content: "call a tool", role: "user" }],
          model: "deepseek-chat",
          tools: [{ function: { name: "lookup" }, type: "function" }],
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(toolResponse.status).toBe(200);
      expect(await toolResponse.text()).toContain("fixture-tool");

      const streamResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        body: JSON.stringify({
          messages: [{ content: "stream", role: "user" }],
          model: "deepseek-reasoner",
          stream: true,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(streamResponse.status).toBe(200);
      const streamBody = await streamResponse.text();
      expect(streamBody).toContain("fixture-stream");
      expect(streamBody).toContain("data: [DONE]");
    } finally {
      server.kill("SIGTERM");
    }
  });
});
