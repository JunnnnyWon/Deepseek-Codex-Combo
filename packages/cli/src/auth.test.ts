import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAuthCommand } from "./auth.ts";

const makeTempDir = (): string => mkdtempSync(join(tmpdir(), "dcc-auth-test-"));

const cleanupTempDir = (path: string): void => {
  rmSync(path, { force: true, recursive: true });
};

describe("dcc auth", () => {
  it("login_with_key_stores_deepseek_api_key_in_local_secret_file", async () => {
    const cwd = makeTempDir();
    try {
      const result = await runAuthCommand({
        args: ["login", "--key", "sk-test-secret"],
        cwd,
        env: {},
      });
      const secretPath = join(cwd, ".dcc", "secrets", "deepseek.env");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("auth: saved");
      expect(result.stdout).not.toContain("sk-test-secret");
      expect(readFileSync(secretPath, "utf8")).toBe('DEEPSEEK_API_KEY="sk-test-secret"\n');
      expect(statSync(secretPath).mode & 0o777).toBe(0o600);
    } finally {
      cleanupTempDir(cwd);
    }
  });

  it("status_reports_configured_file_without_printing_secret", async () => {
    const cwd = makeTempDir();
    try {
      await runAuthCommand({ args: ["login", "--key", "sk-test-secret"], cwd, env: {} });

      const result = await runAuthCommand({ args: ["status"], cwd, env: {} });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("auth: configured");
      expect(result.stdout).toContain("source: local-file");
      expect(result.stdout).not.toContain("sk-test-secret");
    } finally {
      cleanupTempDir(cwd);
    }
  });

  it("logout_removes_local_secret_file", async () => {
    const cwd = makeTempDir();
    try {
      await runAuthCommand({ args: ["login", "--key", "sk-test-secret"], cwd, env: {} });

      const result = await runAuthCommand({ args: ["logout"], cwd, env: {} });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("auth: removed");
      expect(existsSync(join(cwd, ".dcc", "secrets", "deepseek.env"))).toBe(false);
    } finally {
      cleanupTempDir(cwd);
    }
  });

  it("login_skip_exits_without_creating_secret_file", async () => {
    const cwd = makeTempDir();
    try {
      const result = await runAuthCommand({ args: ["login", "--skip"], cwd, env: {} });

      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain("auth: skipped");
      expect(existsSync(join(cwd, ".dcc", "secrets", "deepseek.env"))).toBe(false);
    } finally {
      cleanupTempDir(cwd);
    }
  });
});
