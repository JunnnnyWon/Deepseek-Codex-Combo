import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { withPluginDistLock } from "../../harness/pluginDistLock.ts";

interface ManifestEntry {
  readonly category: string;
  readonly path: string;
  readonly sha256: string;
}

interface ReleaseManifest {
  readonly files: readonly ManifestEntry[];
  readonly packageName: string;
}

interface ChecksumManifest {
  readonly files: readonly Pick<ManifestEntry, "path" | "sha256">[];
}

interface NpmPackEntry {
  readonly files: readonly { readonly path: string }[];
}

const requiredReleasePaths = [
  "bin/dcc.mjs",
  "dist/bin/dcc.mjs",
  "dist/bin/deepseek-codex-combo.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.base.json",
  "plugins/deepseek-codex-combo/.codex-plugin/plugin.json",
  ".agents/plugins/marketplace.json",
  "plugins/deepseek-codex-combo/.mcp.json",
  "plugins/deepseek-codex-combo/hooks/hooks.json",
  "plugins/deepseek-codex-combo/dist/bin/dcc.mjs",
  "plugins/deepseek-codex-combo/agents/dcc-planner-pro.toml",
  "plugins/deepseek-codex-combo/assets/.gitkeep",
  "plugins/deepseek-codex-combo/skills/dcc-plan/SKILL.md",
  "README.md",
  "docs/architecture.md",
  "docs/install.md",
  "docs/security.md",
  "docs/supply-chain.md",
  "CHANGELOG.md",
] as const;

const makeReleaseDir = (): string => mkdtempSync(join(tmpdir(), "dcc-package-test-"));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const runPluginBuild = () =>
  spawnSync(pnpmBin, ["build"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
  });

const runCopiedPluginCli = (pluginRoot: string, cwd: string, args: readonly string[]) =>
  spawnSync(process.execPath, [join(pluginRoot, "dist", "bin", "dcc.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
  });

const forbiddenPackagedRuntimePath = (path: string): boolean => {
  const normalizedPath = path.split("\\").join("/");
  return (
    normalizedPath.includes("/fixtures/") ||
    normalizedPath.includes("/test/") ||
    normalizedPath.includes("/tests/") ||
    normalizedPath.endsWith(".test.js") ||
    normalizedPath.endsWith(".test.mjs") ||
    normalizedPath.endsWith(".test.ts") ||
    normalizedPath.endsWith(".spec.js") ||
    normalizedPath.endsWith(".spec.ts")
  );
};

describe("release package contents", () => {
  it("plugin_build_creates_copied_dist_runtime", () => {
    const build = runPluginBuild();
    const output = `${build.stdout}\n${build.stderr}`;

    expect(build.status).toBe(0);
    expect(output).not.toContain("error");
    expect(existsSync(join(process.cwd(), "plugins/deepseek-codex-combo/dist/bin/dcc.mjs"))).toBe(
      true,
    );
  }, 20_000);

  it("plugin_build_removes_stale_dist_files", () => {
    const stalePath = join(
      process.cwd(),
      "plugins",
      "deepseek-codex-combo",
      "dist",
      "stale",
      "tests",
      "old.test.ts",
    );
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, "throw new Error('stale');\n", "utf8");

    const build = runPluginBuild();
    const output = `${build.stdout}\n${build.stderr}`;

    expect(build.status, output).toBe(0);
    expect(existsSync(stalePath)).toBe(false);
  }, 20_000);

  it("npm_pack_dry_run_excludes_plugin_runtime_tests_and_fixtures", () => {
    const build = runPluginBuild();
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);

    const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(pack.status, `${pack.stdout}\n${pack.stderr}`).toBe(0);

    const [entry] = JSON.parse(pack.stdout) as readonly NpmPackEntry[];
    const forbiddenPaths =
      entry?.files
        .map((file) => file.path)
        .filter((path) =>
          path.startsWith("plugins/deepseek-codex-combo/dist/")
            ? forbiddenPackagedRuntimePath(path)
            : false,
        ) ?? [];

    expect(forbiddenPaths).toEqual([]);
  }, 40_000);

  it("copied_plugin_dist_cli_runs_core_hook_and_mcp_surfaces", () => {
    const build = runPluginBuild();
    const tempRoot = makeReleaseDir();
    const pluginRoot = join(tempRoot, "plugin");
    try {
      expect(build.status).toBe(0);
      withPluginDistLock(() =>
        cpSync(join(process.cwd(), "plugins/deepseek-codex-combo"), pluginRoot, {
          recursive: true,
        }),
      );

      const help = runCopiedPluginCli(pluginRoot, tempRoot, ["--help"]);
      const hook = runCopiedPluginCli(pluginRoot, tempRoot, ["hooks", "session-start"]);
      const lsp = runCopiedPluginCli(pluginRoot, tempRoot, ["lsp", "mcp", "--describe"]);
      const astGrep = runCopiedPluginCli(pluginRoot, tempRoot, ["ast-grep", "mcp", "--describe"]);
      const hashline = runCopiedPluginCli(pluginRoot, tempRoot, ["hashline", "mcp", "--describe"]);

      expect(`${help.stdout}\n${help.stderr}`).toContain("DeepSeek-Codex-Combo CLI");
      expect(hook.stdout).toContain("DCC: ready");
      expect(lsp.stdout).toContain("diagnostics");
      expect(astGrep.stdout).toContain("search");
      expect(hashline.stdout).toContain("hashline.read");
      expect([help.status, hook.status, lsp.status, astGrep.status, hashline.status]).toEqual([
        0, 0, 0, 0, 0,
      ]);
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  }, 20_000);

  it("release_artifact_contains_plugin_and_bins", () => {
    const build = runPluginBuild();
    const outDir = makeReleaseDir();
    try {
      expect(build.status).toBe(0);
      const result = spawnSync(
        process.execPath,
        ["bin/dcc.mjs", "package", "--dry-run", "--out", outDir],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("release package: dry-run");
      expect(output).toContain("checksum manifest:");

      const manifest = readJson<ReleaseManifest>(join(outDir, "release-manifest.json"));
      const checksums = readJson<ChecksumManifest>(join(outDir, "checksums.manifest.json"));
      const manifestPaths = new Set(manifest.files.map((file) => file.path));
      const checksumPaths = new Set(checksums.files.map((file) => file.path));

      expect(manifest.packageName).toBe("deepseek-codex-combo");
      for (const path of requiredReleasePaths) {
        expect(manifestPaths.has(path)).toBe(true);
        expect(checksumPaths.has(path)).toBe(true);
      }
      expect(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);
    } finally {
      rmSync(outDir, { force: true, recursive: true });
    }
  }, 20_000);

  it("release_artifact_excludes_tests_fixtures_and_local_secrets", () => {
    const build = runPluginBuild();
    const outDir = makeReleaseDir();
    try {
      expect(build.status).toBe(0);
      const result = spawnSync(
        process.execPath,
        ["bin/dcc.mjs", "package", "--dry-run", "--out", outDir],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 10_000,
        },
      );
      expect(result.status).toBe(0);

      const manifest = readJson<ReleaseManifest>(join(outDir, "release-manifest.json"));
      const manifestPaths = manifest.files.map((file) => file.path);

      expect(manifestPaths.some((path) => path.includes(".dcc/secrets"))).toBe(false);
      expect(manifestPaths.some((path) => path.includes(".dcc/quarantine"))).toBe(false);
      expect(manifestPaths.some((path) => path.includes("codex-accidental-install"))).toBe(false);
      expect(manifestPaths.some((path) => path.includes("/fixtures/"))).toBe(false);
      expect(manifestPaths.some((path) => path.includes("/tests/"))).toBe(false);
      expect(manifestPaths.some((path) => path.endsWith(".test.ts"))).toBe(false);
    } finally {
      rmSync(outDir, { force: true, recursive: true });
    }
  }, 20_000);
});
