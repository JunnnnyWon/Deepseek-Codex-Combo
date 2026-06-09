import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "./doctor";

const tempHomes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "dcc-doctor-test-"));
  tempHomes.push(home);
  return home;
};

const writeConfiguredHome = async (home: string): Promise<void> => {
  const codexHome = join(home, ".codex");
  await mkdir(join(codexHome, "profiles"), { recursive: true });
  await writeFile(
    join(codexHome, "config.toml"),
    [
      "# >>> DCC managed: provider deepseek_proxy",
      "[model_providers.deepseek_proxy]",
      'name = "DeepSeek Proxy"',
      'base_url = "http://127.0.0.1:41473/v1"',
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
  await writeFile(
    join(codexHome, "profiles", "deepseek-proxy.toml"),
    'model_provider = "deepseek_proxy"\nmodel = "deepseek-v4-pro"\n',
    "utf8",
  );
};

afterEach(async () => {
  const homes = tempHomes.splice(0);
  await Promise.all(homes.map((home) => rm(home, { force: true, recursive: true })));
});

describe("doctor", () => {
  it("doctor_returns_exit_4_when_proxy_down", async () => {
    const home = await makeHome();
    const result = await runDoctor({ env: {}, fixture: "proxy-down", home, live: false });

    expect(result.exitCode).toBe(4);
    expect(result.lines.join("\n")).toContain("proxy failure");
  });

  it("doctor_live_requires_key_and_flag", async () => {
    const home = await makeHome();
    const result = await runDoctor({ env: {}, home, live: true });

    expect(result.exitCode).toBe(3);
    expect(result.lines.join("\n")).toContain("auth failure");
    expect(result.lines.join("\n")).not.toContain("sk-");
  });

  it("doctor_live_calls_models_and_chat_smoke_when_installed", async () => {
    const home = await makeHome();
    await writeConfiguredHome(home);
    const calls: string[] = [];
    const fetchImpl = async (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const requestUrl = url.toString();
      calls.push(`${init?.method ?? "GET"} ${requestUrl}`);
      if (requestUrl.endsWith("/models")) {
        return Response.json({
          data: [{ id: "deepseek-v4-flash", object: "model", owned_by: "deepseek" }],
          object: "list",
        });
      }
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            index: 0,
            message: { content: "DCC_SMOKE_OK", role: "assistant" },
          },
        ],
        id: "chatcmpl_doctor",
        model: "deepseek-v4-flash",
        object: "chat.completion",
      });
    };

    const result = await runDoctor({
      deepSeekBaseUrl: "https://deepseek.test",
      env: { DEEPSEEK_API_KEY: "sk-test-secret" },
      fetchImpl,
      home,
      live: true,
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([
      "GET https://deepseek.test/models",
      "POST https://deepseek.test/chat/completions",
    ]);
    expect(result.lines.join("\n")).toContain("Live: chat smoke ok");
    expect(result.lines.join("\n")).not.toContain("sk-test-secret");
  });

  it("doctor_strict_fails_when_plugin_runtime_or_proxy_is_missing", async () => {
    const home = await makeHome();
    await writeConfiguredHome(home);

    const result = await runDoctor({ env: {}, home, live: false, strict: true });

    expect(result.exitCode).toBe(4);
    expect(result.lines.join("\n")).toContain("plugin runtime missing");
  });
});
