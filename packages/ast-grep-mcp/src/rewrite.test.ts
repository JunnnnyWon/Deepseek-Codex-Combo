import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAstGrepRewrite } from "./index";

describe("ast-grep rewrite", () => {
  it("rewrite_dry_run_is_default", () => {
    const path = "tests/fixtures/ast-grep/src/index.ts";
    const original = readFileSync(path, "utf8");

    const result = runAstGrepRewrite({
      language: "typescript",
      path: "tests/fixtures/ast-grep",
      pattern: "console.log($MSG)",
      rewrite: "logger.info($MSG)",
    });

    expect(result.dryRun).toBe(true);
    expect(result.matchCount).toBeGreaterThan(0);
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("requires_confirmation_above_100_rewrites", () => {
    const root = mkdtempSync(join(tmpdir(), "dcc-ast-grep-test-"));
    try {
      writeFileSync(
        join(root, "many.ts"),
        Array.from({ length: 101 }, (_, index) => `console.log(${index});`).join("\n"),
        "utf8",
      );

      expect(() =>
        runAstGrepRewrite({
          dryRun: false,
          language: "typescript",
          path: root,
          pattern: "console.log($MSG)",
          rewrite: "logger.info($MSG)",
        }),
      ).toThrowError("confirmation_required");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
