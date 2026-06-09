import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const childProcesses: ChildProcessWithoutNullStreams[] = [];

const getFreePort = async (): Promise<number> =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("free port server did not bind");
      }
      server.close(() => resolve(address.port));
    });
  });

const waitForReady = async (child: ChildProcessWithoutNullStreams): Promise<void> =>
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
        resolve();
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

describe("dcc proxy stream fixtures", () => {
  afterEach(() => {
    for (const child of childProcesses.splice(0)) {
      child.kill("SIGTERM");
    }
  });

  it("prints_response_stream_events_in_order", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "proxy", "stream-fixture", "tests/fixtures/proxy/stream-response.sse"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
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
    expect(result.stdout).not.toContain("hidden-chain");
  });

  it("maps_reasoning_continuation_error_without_raw_reasoning", () => {
    const result = spawnSync(
      "node",
      [
        "bin/dcc.mjs",
        "proxy",
        "reasoning-error-fixture",
        "tests/fixtures/proxy/reasoning-missing-error.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("adapter_error");
    expect(`${result.stdout}\n${result.stderr}`).toContain("reasoning continuation");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("hidden-chain");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("reasoning_content");
  });

  it("fails_closed_for_missing_stream_fixture_without_reasoning_leakage", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "proxy", "stream-fixture", "/tmp/does-not-exist.sse"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("ENOENT");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("hidden-chain");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("reasoning_content");
  });

  it("prints_stream_usage_event_without_leaks", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "proxy", "stream-fixture", "tests/fixtures/proxy/stream-usage-response.sse"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
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
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("hidden-chain");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("reasoning_content");
  });

  it("streams_responses_sse_through_running_proxy", async () => {
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [
        "bin/dcc.mjs",
        "proxy",
        "start",
        "--port",
        String(port),
        "--mock-upstream",
        "tests/fixtures/proxy/stream-usage-response.sse",
      ],
      { cwd: process.cwd() },
    );
    childProcesses.push(child);
    await waitForReady(child);

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
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
    expect(body).toContain("event: response.created");
    expect(body).toContain("event: response.usage");
    expect(body).toContain("event: response.completed");
    expect(body.indexOf("event: response.usage")).toBeLessThan(
      body.indexOf("event: response.completed"),
    );
    expect(body).not.toContain("hidden-chain");
    expect(body).not.toContain("reasoning_content");
  });

  it("streams_responses_sse_from_json_mock_fixture", async () => {
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [
        "bin/dcc.mjs",
        "proxy",
        "start",
        "--port",
        String(port),
        "--mock-upstream",
        "tests/fixtures/proxy/text-response.json",
      ],
      { cwd: process.cwd() },
    );
    childProcesses.push(child);
    await waitForReady(child);

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      body: JSON.stringify({
        input: "stream from json fixture",
        model: "deepseek-v4-flash",
        stream: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("event: response.output_text.delta");
    expect(body).toContain("Fixture answer.");
    expect(body).toContain("event: response.completed");
  });
});
