import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("rules CLI", () => {
  it("lists_deduped_rules_dry_run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "rules",
        "list",
        "--cwd",
        "tests/fixtures/rules/duplicate-sources",
        "--dry-run",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output.match(/<DCC_PROJECT_RULES>/g)).toHaveLength(6);
    expect(output).toContain("Source: .dcc/rules/testing.md");
    expect(output).not.toContain(".omo/rules/testing-copy.md");
    expect(output).not.toContain("AGENTS.md");
  });

  it("reports_rule_budget_exceeded", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "rules",
        "list",
        "--cwd",
        "tests/fixtures/rules/oversized",
        "--budget",
        "200",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("rule_budget_exceeded");
    expect(output).toContain(".dcc/rules/huge.md");
    expect(output).not.toContain("Lorem ipsum");
  });
});
