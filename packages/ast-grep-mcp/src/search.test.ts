import { describe, expect, it } from "vitest";
import { runAstGrepSearch } from "./index";

describe("ast-grep search", () => {
  it("finds_typescript_function_by_ast_pattern", () => {
    const result = runAstGrepSearch({
      language: "typescript",
      path: "tests/fixtures/ast-grep",
      pattern: "function $NAME($ARGS)",
    });

    expect(result.language).toBe("typescript");
    expect(result.matchCount).toBeGreaterThan(0);
    expect(result.matches[0]).toMatchObject({
      filePath: expect.stringContaining("index.ts"),
      line: 1,
      captures: { NAME: "formatMessage" },
    });
  });

  it("blocks_malformed_pattern_injection", () => {
    expect(() =>
      runAstGrepSearch({
        language: "typescript",
        path: "tests/fixtures/ast-grep",
        pattern: '""; touch /tmp/pwn',
      }),
    ).toThrowError("malformed_pattern");
  });
});
