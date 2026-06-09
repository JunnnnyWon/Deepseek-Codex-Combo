import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dcc ast-grep and hashline", () => {
  it("ast_grep_search_finds_console_log", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "ast-grep",
        "search",
        "--lang",
        "typescript",
        "--pattern",
        "console.log($MSG)",
        "tests/fixtures/ts-node-app",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 5_000 },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as { matchCount: number; matches: unknown[] };
    expect(parsed.matchCount).toBeGreaterThan(0);
    expect(parsed.matches.length).toBeGreaterThan(0);
  });

  it("ast_grep_rewrite_dry_run_does_not_mutate_fixture", () => {
    const fixturePath = "tests/fixtures/ts-node-app/src/index.ts";
    const before = readFileSync(fixturePath, "utf8");
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "ast-grep",
        "rewrite",
        "--lang",
        "typescript",
        "--pattern",
        "console.log($MSG)",
        "--rewrite",
        "logger.info($MSG)",
        "tests/fixtures/ts-node-app",
        "--dry-run",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 5_000 },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun":true');
    expect(readFileSync(fixturePath, "utf8")).toBe(before);
  });

  it("hashline_stale_patch_exits_nonzero", () => {
    const result = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "hashline", "apply", "--fixture", "tests/fixtures/hashline/stale.patch"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 5_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("hash_mismatch");
    expect(output).toContain("refresh");
  });
});
