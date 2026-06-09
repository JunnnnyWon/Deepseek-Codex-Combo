import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runDcc = (
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd = process.cwd(),
  timeout = 20_000,
) =>
  spawnSync(process.execPath, [join(process.cwd(), "bin", "dcc.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env,
    timeout,
  });

const makeTempDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));

const cleanupDir = (path: string): void => {
  rmSync(path, { force: true, recursive: true });
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

describe("dcc sandbox", () => {
  it("bare_dcc_defaults_to_isolated_sandbox_run", async () => {
    const originalHome = makeTempDir("dcc-bare-original-home-");
    const sandboxHome = makeTempDir("dcc-bare-sandbox-home-");
    const cwd = makeTempDir("dcc-bare-cwd-");
    const port = await getFreePort();
    try {
      const result = runDcc(
        [],
        {
          ...process.env,
          DCC_PROXY_PORT: String(port),
          DCC_SANDBOX_HOME: sandboxHome,
          DCC_SANDBOX_SKIP_CODEX: "1",
          DCC_SANDBOX_NO_DOCTOR: "1",
          DEEPSEEK_API_KEY: "sk-test-secret",
          HOME: originalHome,
        },
        cwd,
        30_000,
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain(`sandbox home: ${sandboxHome}`);
      expect(output).toContain("codex profile: deepseek-proxy");
      expect(existsSync(join(originalHome, ".codex", "config.toml"))).toBe(false);
      expect(existsSync(join(sandboxHome, ".codex", "config.toml"))).toBe(true);
    } finally {
      runDcc(["proxy", "stop", "--home", sandboxHome, "--port", String(port)], process.env);
      cleanupDir(originalHome);
      cleanupDir(sandboxHome);
      cleanupDir(cwd);
    }
  }, 30_000);

  it("run_prompts_and_saves_api_key_when_first_run_has_no_key", async () => {
    const originalHome = makeTempDir("dcc-prompt-original-home-");
    const sandboxHome = makeTempDir("dcc-prompt-sandbox-home-");
    const cwd = makeTempDir("dcc-prompt-cwd-");
    const port = await getFreePort();
    try {
      const result = runDcc(
        [
          "sandbox",
          "run",
          "--home",
          sandboxHome,
          "--proxy-port",
          String(port),
          "--skip-codex",
          "--no-doctor",
        ],
        {
          ...process.env,
          DCC_TEST_API_KEY_PROMPT_RESPONSE: "sk-test-secret",
          HOME: originalHome,
        },
        cwd,
        30_000,
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("auth: saved");
      expect(output).not.toContain("sk-test-secret");
      expect(readFileSync(join(cwd, ".dcc", "secrets", "deepseek.env"), "utf8")).toContain(
        "DEEPSEEK_API_KEY",
      );
      expect(existsSync(join(originalHome, ".codex", "config.toml"))).toBe(false);
    } finally {
      runDcc(["proxy", "stop", "--home", sandboxHome, "--port", String(port)], process.env);
      cleanupDir(originalHome);
      cleanupDir(sandboxHome);
      cleanupDir(cwd);
    }
  }, 30_000);

  it("run_skip_auth_exits_without_touching_original_codex", async () => {
    const originalHome = makeTempDir("dcc-skip-auth-original-home-");
    const sandboxHome = makeTempDir("dcc-skip-auth-sandbox-home-");
    const cwd = makeTempDir("dcc-skip-auth-cwd-");
    const port = await getFreePort();
    try {
      const result = runDcc(
        [
          "sandbox",
          "run",
          "--home",
          sandboxHome,
          "--proxy-port",
          String(port),
          "--skip-auth",
          "--skip-codex",
        ],
        {
          ...process.env,
          DEEPSEEK_API_KEY: "",
          HOME: originalHome,
        },
        cwd,
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(2);
      expect(output).toContain("auth: skipped");
      expect(output).toContain("dcc auth login");
      expect(existsSync(join(originalHome, ".codex", "config.toml"))).toBe(false);
      expect(existsSync(join(cwd, ".dcc", "secrets", "deepseek.env"))).toBe(false);
    } finally {
      runDcc(["proxy", "stop", "--home", sandboxHome, "--port", String(port)], process.env);
      cleanupDir(originalHome);
      cleanupDir(sandboxHome);
      cleanupDir(cwd);
    }
  });

  it("prints_side_effect_free_help", () => {
    const home = makeTempDir("dcc-sandbox-help-home-");
    const cwd = makeTempDir("dcc-sandbox-help-cwd-");
    try {
      const result = runDcc(["sandbox", "--help"], { ...process.env, HOME: home }, cwd);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("Usage:");
      expect(output).toContain("dcc sandbox run");
      expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
      expect(existsSync(join(cwd, ".dcc", "sandbox-home"))).toBe(false);
    } finally {
      cleanupDir(home);
      cleanupDir(cwd);
    }
  });

  it("run_installs_into_sandbox_home_and_leaves_original_codex_untouched", async () => {
    const originalHome = makeTempDir("dcc-original-home-");
    const sandboxHome = makeTempDir("dcc-official-sandbox-home-");
    const port = await getFreePort();
    try {
      writeFileSync(join(originalHome, ".codex-config-sentinel"), "keep", "utf8");
      const result = runDcc(
        [
          "sandbox",
          "run",
          "--home",
          sandboxHome,
          "--proxy-port",
          String(port),
          "--mock-upstream",
          "tests/fixtures/proxy/text-response.json",
          "--skip-codex",
        ],
        {
          ...process.env,
          HOME: originalHome,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain(`sandbox home: ${sandboxHome}`);
      expect(output).toContain("codex profile: deepseek-proxy");
      expect(output).toContain("proxy stop: stopped");
      expect(readFileSync(join(originalHome, ".codex-config-sentinel"), "utf8")).toBe("keep");
      expect(existsSync(join(originalHome, ".codex", "config.toml"))).toBe(false);
      expect(readFileSync(join(sandboxHome, ".codex", "config.toml"), "utf8")).toContain(
        "[model_providers.deepseek_proxy]",
      );
      expect(
        readFileSync(join(sandboxHome, ".codex", "profiles", "deepseek-proxy.toml"), "utf8"),
      ).toContain('model = "deepseek-v4-pro"');
    } finally {
      runDcc(["proxy", "stop", "--home", sandboxHome, "--port", String(port)], process.env);
      cleanupDir(originalHome);
      cleanupDir(sandboxHome);
    }
  }, 30_000);

  it("auto_prompt_routes_through_deepseek_current_and_records_initial_agent", async () => {
    const originalHome = makeTempDir("dcc-auto-original-home-");
    const sandboxHome = makeTempDir("dcc-auto-sandbox-home-");
    const port = await getFreePort();
    try {
      const result = runDcc(
        [
          "sandbox",
          "run",
          "--home",
          sandboxHome,
          "--proxy-port",
          String(port),
          "--mock-upstream",
          "tests/fixtures/proxy/text-response.json",
          "--auto-prompt",
          "보안 취약점과 권한 문제를 검증해줘",
          "--skip-codex",
        ],
        {
          ...process.env,
          HOME: originalHome,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("codex profile: deepseek-current");
      expect(output).toContain("switch: apply");
      expect(output).toContain('dcc_agent = "dcc-verifier-pro"');
      expect(output).toContain("initial agent: dcc-verifier-pro");
      expect(
        readFileSync(join(sandboxHome, ".codex", "profiles", "deepseek-current.toml"), "utf8"),
      ).toContain('dcc_agent = "dcc-verifier-pro"');
      expect(existsSync(join(originalHome, ".codex", "config.toml"))).toBe(false);
    } finally {
      runDcc(["proxy", "stop", "--home", sandboxHome, "--port", String(port)], process.env);
      cleanupDir(originalHome);
      cleanupDir(sandboxHome);
    }
  }, 30_000);
});
