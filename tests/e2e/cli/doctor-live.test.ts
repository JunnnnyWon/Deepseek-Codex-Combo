import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withPluginDistLock } from "../../harness/pluginDistLock.ts";

type MockCall = {
  readonly authorization: string | undefined;
  readonly body: string;
  readonly method: string;
  readonly url: string;
};

const makeHome = (): string => mkdtempSync(join(tmpdir(), "dcc-cli-doctor-live-test-"));

const cleanupHome = (home: string): void => {
  rmSync(home, { force: true, recursive: true });
};

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

const requestBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });

const startDeepSeekMock = async (): Promise<{
  readonly baseUrl: string;
  readonly calls: readonly MockCall[];
  readonly close: () => Promise<void>;
}> => {
  const calls: MockCall[] = [];
  const server = createServer(async (request, response) => {
    const body = await requestBody(request);
    calls.push({
      authorization: request.headers.authorization,
      body,
      method: request.method ?? "GET",
      url: request.url ?? "/",
    });

    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          data: [{ id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" }],
          object: "list",
        }),
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "DCC_SMOKE_OK", role: "assistant" },
          },
        ],
        id: "chatcmpl_doctor_e2e",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      }),
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("mock server did not bind");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) {
            resolve();
            return;
          }
          reject(error);
        });
      }),
  };
};

const runDcc = (args: readonly string[], env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
    timeout: 10_000,
  });

const runDccAsync = async (
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ readonly status: number | null; readonly stderr: string; readonly stdout: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["bin/dcc.mjs", ...args], {
      cwd: process.cwd(),
      env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`dcc command timed out: ${args.join(" ")}`));
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (status) => {
      clearTimeout(timer);
      resolve({ status, stderr, stdout });
    });
  });

const envWithoutDeepSeekKey = (): NodeJS.ProcessEnv => {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== "DEEPSEEK_API_KEY" && value !== undefined) {
      next[key] = value;
    }
  }
  return next;
};

const writeInstalledHome = (home: string, proxyPort: number): void => {
  mkdirSync(join(home, ".codex", "profiles"), { recursive: true });
  mkdirSync(join(home, ".codex", "plugins", "cache", "deepseek-codex-combo"), {
    recursive: true,
  });
  writeFileSync(
    join(home, ".codex", "config.toml"),
    [
      "# >>> DCC managed: provider deepseek_proxy",
      "[model_providers.deepseek_proxy]",
      'name = "DeepSeek Proxy"',
      `base_url = "http://127.0.0.1:${proxyPort}/v1"`,
      'wire_api = "responses"',
      "# <<< DCC managed: provider deepseek_proxy",
      "# >>> DCC managed: plugin deepseek-codex-combo activation",
      '[plugins."deepseek-codex-combo@deepseek-codex-combo"]',
      "enabled = true",
      "# <<< DCC managed: plugin deepseek-codex-combo activation",
      "# >>> DCC managed: plugin deepseek-codex-combo mcp_servers",
      '[plugins."deepseek-codex-combo@deepseek-codex-combo".mcp_servers]',
      "dcc_ast_grep = { enabled = true }",
      "dcc_hashline = { enabled = true }",
      "# <<< DCC managed: plugin deepseek-codex-combo mcp_servers",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    join(home, ".codex", "profiles", "deepseek-proxy.toml"),
    'model_provider = "deepseek_proxy"\nmodel = "deepseek-v4-pro"\n',
    "utf8",
  );
  withPluginDistLock(() =>
    cpSync(
      "plugins/deepseek-codex-combo",
      join(
        home,
        ".codex",
        "plugins",
        "cache",
        "deepseek-codex-combo",
        "deepseek-codex-combo",
        "0.1.0",
      ),
      {
        recursive: true,
      },
    ),
  );
};

describe("dcc doctor live CLI", () => {
  it("live_without_key_fails_closed", () => {
    const home = makeHome();
    try {
      const result = runDcc(["doctor", "--home", home, "--live"], envWithoutDeepSeekKey());
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(3);
      expect(output).toContain("DEEPSEEK_API_KEY required");
      expect(output).not.toContain("Live: models ok");
      expect(output).not.toContain("sk-");
    } finally {
      cleanupHome(home);
    }
  });

  it("live_strict_smokes_deepseek_and_running_proxy", async () => {
    const home = makeHome();
    const proxyPort = await getFreePort();
    const mock = await startDeepSeekMock();
    try {
      writeInstalledHome(home, proxyPort);
      const start = runDcc([
        "proxy",
        "start",
        "--home",
        home,
        "--background",
        "--port",
        String(proxyPort),
        "--mock-upstream",
        "tests/fixtures/proxy/text-response.json",
      ]);
      expect(`${start.stdout}\n${start.stderr}`).toContain("proxy background: started");

      const result = await runDccAsync(
        ["doctor", "--home", home, "--live", "--strict", "--deepseek-base-url", mock.baseUrl],
        { ...process.env, DEEPSEEK_API_KEY: "sk-test-secret" },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("Live: models ok");
      expect(output).toContain("Live: chat smoke ok");
      expect(output).toContain("Proxy: responses smoke ok");
      expect(output).toContain("Cache: diagnostics ok");
      expect(output).not.toContain("sk-test-secret");
      expect(output).not.toContain("Authorization");
      expect(output).not.toContain("DCC_SMOKE_OK");
      expect(mock.calls.map((call) => `${call.method} ${call.url}`)).toEqual([
        "GET /models",
        "POST /chat/completions",
      ]);
      expect(mock.calls.every((call) => call.authorization === "Bearer sk-test-secret")).toBe(true);
      expect(mock.calls[1]?.body).toContain("DCC_SMOKE_OK");
    } finally {
      runDcc(["proxy", "stop", "--home", home, "--port", String(proxyPort)]);
      cleanupHome(home);
      await mock.close();
    }
  }, 20_000);
});
