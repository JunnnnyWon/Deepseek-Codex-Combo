import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runDcc = (args: readonly string[]) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 45_000,
  });

describe("full fixture acceptance without live API", () => {
  it("fixture_plan_start_work_loop_records_evidence", () => {
    const home = mkdtempSync(join(tmpdir(), "dcc-acceptance-home-"));
    const releaseDir = mkdtempSync(join(tmpdir(), "dcc-acceptance-release-"));
    try {
      const install = runDcc([
        "install",
        "--dry-run",
        "--home",
        home,
        "--provider-mode=proxy",
        "--no-tui",
      ]);
      expect(install.status).toBe(0);
      expect(install.stdout).toContain("provider_mode: proxy");

      const text = runDcc([
        "proxy",
        "transform-fixture",
        "tests/fixtures/proxy/text-response.json",
      ]);
      expect(text.status).toBe(0);
      expect(text.stdout).toContain("response.completed");

      const stream = runDcc([
        "proxy",
        "stream-fixture",
        "tests/fixtures/proxy/stream-response.sse",
      ]);
      expect(stream.status).toBe(0);
      expect(stream.stdout).toContain("response.function_call_arguments.done");

      const initDeep = runDcc(["init-deep", "--cwd", "tests/fixtures/ts-node-app", "--dry-run"]);
      expect(initDeep.status).toBe(0);
      expect(initDeep.stdout).toContain(".dcc/project-index.json");

      const packaging = runDcc(["package", "--dry-run", "--out", releaseDir]);
      expect(packaging.status, `${packaging.stdout}\n${packaging.stderr}`).toBe(0);
      expect(packaging.stdout).toContain("release-manifest.json");
    } finally {
      rmSync(home, { force: true, recursive: true });
      rmSync(releaseDir, { force: true, recursive: true });
    }
  }, 60_000);
});
