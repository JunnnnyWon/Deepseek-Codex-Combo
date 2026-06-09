import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRulesInjection } from "./injectRules";

describe("buildRulesInjection", () => {
  it("formats_dcc_project_rules_block_with_budget", async () => {
    const result = await buildRulesInjection({
      budget: 4_000,
      cwd: join(process.cwd(), "tests/fixtures/rules/duplicate-sources"),
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("<DCC_PROJECT_RULES>");
    expect(result.output).toContain("Source: .dcc/rules/testing.md");
    expect(result.output).not.toContain(".omo/rules/testing-copy.md");
    expect(result.output).not.toContain("AGENTS.md");
  });

  it("reports_budget_overflow_without_full_rule_body", async () => {
    const result = await buildRulesInjection({
      budget: 200,
      cwd: join(process.cwd(), "tests/fixtures/rules/oversized"),
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "rule_budget_exceeded",
        sourcePath: ".dcc/rules/huge.md",
      }),
    );
    expect(result.output).not.toContain("Lorem ipsum");
  });
});
