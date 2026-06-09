import { describe, expect, it } from "vitest";
import { runPostToolUseHook } from "./lifecycle";

describe("hook post-tool-use", () => {
  it("edit_like_tool_runs_checker_and_lsp", () => {
    const result = runPostToolUseHook({
      content: "// This function handles payment retries",
      toolName: "Edit",
    });
    const output = result.lines.join("\n");

    expect(result.exitCode).toBe(2);
    expect(output).toContain("Checking Comments");
    expect(output).toContain("ai_slop_comment");
    expect(output).toContain("LSP diagnostics");
    expect(output).toContain("lsp: ok");
  });
});
