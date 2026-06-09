import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { withPluginDistLock } from "../../harness/pluginDistLock.ts";

const makeHome = (): string => mkdtempSync(join(tmpdir(), "dcc-cli-install-test-"));

const cleanupHome = (home: string): void => {
  rmSync(home, { force: true, recursive: true });
};

describe("dcc install", () => {
  it("renders_proxy_dry_run_without_home_or_secret_leakage", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "install",
          "--dry-run",
          "--home",
          home,
          "--provider-mode=proxy",
          "--no-tui",
          "--no-codex-autonomous",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status, output).toBe(0);
      expect(output).toContain("# >>> DCC managed: provider deepseek_proxy");
      expect(output).toContain('base_url = "http://127.0.0.1:41473/v1"');
      expect(output).toContain("plugin install plan: present");
      expect(output).toContain("dcc-lsp");
      expect(output).toContain("autostart: none");
      expect(output).toContain("telemetry: disabled");
      expect(output).not.toContain(home);
      expect(output).not.toContain("Authorization");
      expect(output).not.toContain("sk-");
      expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
    } finally {
      cleanupHome(home);
    }
  }, 20_000);

  it("native_mode_fails_closed", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        ["bin/dcc.mjs", "install", "--dry-run", "--home", home, "--provider-mode=native"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain("native provider mode unsupported");
      expect(output).not.toContain("provider deepseek_proxy");
      expect(output).not.toContain(home);
      expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
    } finally {
      cleanupHome(home);
    }
  });

  it("plugin_only_dry_run_can_disable_optional_mcp_servers", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "install",
          "--dry-run",
          "--home",
          home,
          "--provider-mode=plugin-only",
          "--no-ast-grep",
          "--no-hashline",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("provider_mode: plugin-only");
      expect(output).toContain("dcc-lsp");
      expect(output).not.toContain("dcc-ast-grep");
      expect(output).not.toContain("dcc-hashline");
      expect(output).toContain(
        "planned file: .codex/plugins/cache/deepseek-codex-combo/deepseek-codex-combo/0.1.0",
      );
      expect(existsSync(join(home, ".codex", "config.toml"))).toBe(false);
    } finally {
      cleanupHome(home);
    }
  });

  it("rejects_invalid_optional_mcp_flag_values", () => {
    const home = makeHome();
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "install",
          "--dry-run",
          "--home",
          home,
          "--provider-mode=plugin-only",
          "--no-ast-grep=maybe",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 5_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain("invalid boolean flag");
      expect(output).toContain("--no-ast-grep");
    } finally {
      cleanupHome(home);
    }
  });

  it("applies_install_when_cli_runs_from_an_unrelated_cwd", () => {
    const home = makeHome();
    const unrelatedCwd = mkdtempSync(join(tmpdir(), "dcc-cli-cwd-test-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          resolve("bin/dcc.mjs"),
          "install",
          "--home",
          home,
          "--provider-mode=plugin-only",
          "--no-tui",
        ],
        {
          cwd: unrelatedCwd,
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("install: apply");
      expect(
        existsSync(
          join(
            home,
            ".codex",
            "plugins",
            "cache",
            "deepseek-codex-combo",
            "deepseek-codex-combo",
            "0.1.0",
            "hooks",
            "hooks.json",
          ),
        ),
      ).toBe(true);
    } finally {
      cleanupHome(home);
      rmSync(unrelatedCwd, { force: true, recursive: true });
    }
  }, 20_000);

  it("built_dist_cli_runs_install_dry_run_under_node_20", () => {
    const home = makeHome();
    try {
      const result = withPluginDistLock(() => {
        const build = spawnSync(process.execPath, ["scripts/build-cli.mjs"], {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DCC_CLI_DIST_LOCK_HELD: "1" },
          timeout: 30_000,
        });
        expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);

        return spawnSync(
          "npx",
          [
            "-y",
            "node@20",
            "dist/bin/dcc.mjs",
            "install",
            "--dry-run",
            "--home",
            home,
            "--provider-mode=proxy",
            "--no-tui",
          ],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            timeout: 60_000,
          },
        );
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status, output).toBe(0);
      expect(output).toContain("install: dry-run");
      expect(output).toContain("plugin install plan: present");
      expect(output).not.toContain(home);
    } finally {
      cleanupHome(home);
    }
  }, 90_000);
});
