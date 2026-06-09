import { describe, expect, it } from "vitest";
import { checkCommentText } from "./checker";

describe("comment checker", () => {
  it("blocks_ai_slop_comment", () => {
    const result = checkCommentText("// This function handles user login");

    expect(result.exitCode).toBe(2);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "ai_slop_comment",
      }),
    );
  });

  it("allows_useful_why_comment", () => {
    const result = checkCommentText("// Keep this branch constant-time to avoid timing leaks.");

    expect(result.exitCode).toBe(0);
    expect(result.findings).toHaveLength(0);
  });
});
