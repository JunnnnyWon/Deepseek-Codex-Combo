import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const makeHome = (): string => mkdtempSync(join(tmpdir(), "dcc-cli-doctor-test-"));

const cleanupHome = (home: string): void => {
  rmSync(home, { force: true, recursive: true });
};

describe("models and doctor CLI", () => {
  it("models_offline_lists_deepseek_catalog", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "models", "--offline"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 5_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("deepseek-v4-pro");
    expect(output).toContain("deepseek-v4-flash");
  });

  it("doctor_auth_failure_returns_exit_3", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        ["bin/dcc.mjs", "doctor", "--home", home, "--fixture", "auth-failure"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(3);
      expect(output).toContain("auth failure");
      expect(output).not.toContain(home);
      expect(output).not.toContain("Authorization");
    } finally {
      cleanupHome(home);
    }
  });

  it("switch_pro_dry_run_renders_profile_patch", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        ["bin/dcc.mjs", "switch", "pro", "--dry-run", "--home", home],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain('model = "deepseek-v4-pro"');
      expect(output).toContain('model_provider = "deepseek_proxy"');
      expect(output).not.toContain(home);
    } finally {
      cleanupHome(home);
    }
  });

  it("switch_auto_routes_prompt_to_flash_profile", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "switch",
          "auto",
          "--dry-run",
          "--home",
          home,
          "--prompt",
          "이 코드 구조를 간단히 요약해줘",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("target: auto");
      expect(output).toContain("category: summarize");
      expect(output).toContain('model = "deepseek-v4-flash"');
      expect(output).toContain('dcc_route_category = "summarize"');
      expect(output).toContain('dcc_agent = "dcc-librarian-flash"');
      expect(output).not.toContain(home);
    } finally {
      cleanupHome(home);
    }
  });

  it("switch_auto_routes_security_prompt_to_pro_profile", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "switch",
          "auto",
          "--dry-run",
          "--home",
          home,
          "--prompt",
          "보안 취약점과 권한 문제를 검증해줘",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("category: security");
      expect(output).toContain('model = "deepseek-v4-pro"');
      expect(output).toContain('dcc_route_category = "security"');
      expect(output).toContain('dcc_agent = "dcc-verifier-pro"');
      expect(output).not.toContain(home);
    } finally {
      cleanupHome(home);
    }
  });
});
