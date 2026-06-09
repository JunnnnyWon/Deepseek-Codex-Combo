import { describe, expect, it } from "vitest";
import { redactText } from "./redact";

describe("redactText", () => {
  it("redacts secret path prompt and auth values", () => {
    const homePath = "/Users/example";
    const input = [
      "api key sk-test-123456",
      "Authorization: Bearer deepseek-token",
      "prompt: Please rewrite the hidden prompt",
      "source: function leak() { return true; }",
      "remote: git@github.com:junnnny/private-repo.git",
      "host: codex-macbook.local",
      "email: junnnny@example.com",
      `path: ${homePath}/private.ts`,
    ].join("\n");

    const output = redactText(input, {
      homePath,
      sensitiveTerms: ["Please rewrite the hidden prompt", "function leak() { return true; }"],
    });

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("sk-test-123456");
    expect(output).not.toContain("deepseek-token");
    expect(output).not.toContain("Please rewrite the hidden prompt");
    expect(output).not.toContain("function leak()");
    expect(output).not.toContain("git@github.com:junnnny/private-repo.git");
    expect(output).not.toContain("codex-macbook.local");
    expect(output).not.toContain("junnnny@example.com");
    expect(output).not.toContain(`${homePath}/private.ts`);
  });

  it("does_not_redact_words_containing_sk_dash", () => {
    expect(redactText("Keep generated UI text concise and task-focused.")).toContain(
      "task-focused",
    );
  });
});
