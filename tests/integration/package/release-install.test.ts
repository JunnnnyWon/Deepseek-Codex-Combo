import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const releaseManifestSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
  packageName: z.literal("deepseek-codex-combo"),
});

const checksumManifestSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().min(1),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

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

const runNode = (
  cwd: string,
  args: readonly string[],
  timeout = 15_000,
): ReturnType<typeof spawnSync> =>
  spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    timeout,
  });

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const sha256File = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

describe("release package installability", () => {
  it("release_files_install_smoke_hooks_mcp_proxy_and_uninstall", async () => {
    const build = spawnSync(pnpmBin, ["build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(build.status).toBe(0);

    const outDir = mkdtempSync(join(tmpdir(), "dcc-release-out-"));
    const home = mkdtempSync(join(tmpdir(), "dcc-release-home-"));
    try {
      const packageResult = runNode(process.cwd(), ["bin/dcc.mjs", "package", "--out", outDir]);
      expect(packageResult.status).toBe(0);

      const releaseRoot = join(outDir, "files");
      const manifest = releaseManifestSchema.parse(readJson(join(outDir, "release-manifest.json")));
      const checksums = checksumManifestSchema.parse(
        readJson(join(outDir, "checksums.manifest.json")),
      );
      const checksumPaths = new Set(checksums.files.map((file) => file.path));
      for (const file of manifest.files) {
        expect(checksumPaths.has(file.path)).toBe(true);
        expect(sha256File(join(releaseRoot, file.path))).toBe(file.sha256);
      }

      const port = await getFreePort();
      const install = runNode(releaseRoot, [
        "dist/bin/dcc.mjs",
        "install",
        "--home",
        home,
        "--provider-mode=proxy",
        "--proxy-port",
        String(port),
        "--no-tui",
      ]);
      expect(`${install.stdout}\n${install.stderr}`).toContain("install: apply");
      expect(install.status).toBe(0);

      const installedCli = join(
        home,
        ".codex",
        "plugins",
        "cache",
        "deepseek-codex-combo",
        "deepseek-codex-combo",
        "0.1.0",
        "dist",
        "bin",
        "dcc.mjs",
      );
      const hook = runNode(process.cwd(), [installedCli, "hooks", "session-start"]);
      expect(hook.status).toBe(0);
      expect(hook.stdout).toContain("DCC: ready");

      const mcp = runNode(process.cwd(), [installedCli, "lsp", "mcp", "--describe"]);
      expect(mcp.status).toBe(0);
      expect(mcp.stdout).toContain("lsp.diagnostics");

      const mockFixture = join(home, "mock-upstream.json");
      writeFileSync(
        mockFixture,
        readFileSync(join(process.cwd(), "tests", "fixtures", "proxy", "text-response.json")),
      );
      const start = runNode(releaseRoot, [
        "dist/bin/dcc.mjs",
        "proxy",
        "start",
        "--background",
        "--home",
        home,
        "--port",
        String(port),
        "--mock-upstream",
        mockFixture,
      ]);
      expect(start.status).toBe(0);
      expect(start.stdout).toContain("proxy background: started");

      const stop = runNode(releaseRoot, [
        "dist/bin/dcc.mjs",
        "proxy",
        "stop",
        "--home",
        home,
        "--port",
        String(port),
      ]);
      expect(stop.status).toBe(0);
      expect(stop.stdout).toContain("proxy stop: stopped");

      const uninstall = runNode(releaseRoot, ["dist/bin/dcc.mjs", "uninstall", "--home", home]);
      expect(uninstall.status).toBe(0);
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
          ),
        ),
      ).toBe(false);
    } finally {
      rmSync(outDir, { force: true, recursive: true });
      rmSync(home, { force: true, recursive: true });
    }
  }, 60_000);
});
