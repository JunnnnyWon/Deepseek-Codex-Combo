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
