import { describe, expect, it } from "vitest";
import { runUserPromptSubmitHook } from "./lifecycle";

describe("hook user-prompt-submit", () => {
  it("ultrawork_keyword_injects_directive_without_logging_prompt", () => {
    const rawPrompt = "Please run ultrawork with sk-secret-123 and do not echo me.";
    const result = runUserPromptSubmitHook({ prompt: rawPrompt });
    const output = result.lines.join("\n");

    expect(result.exitCode).toBe(0);
    expect(output).toContain("workflow directive: ultrawork");
    expect(output).toContain("agent route: use=dcc-worker-pro");
    expect(output).toContain("agent instruction: delegate to dcc-worker-pro");
    expect(output).not.toContain(rawPrompt);
    expect(output).not.toContain("sk-secret-123");
  });
});
