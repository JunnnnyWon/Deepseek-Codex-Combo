import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverRules } from "./discoverRules";

const fixtureRoot = join(process.cwd(), "tests/fixtures/rules/duplicate-sources");

describe("discoverRules", () => {
  it("discovers_sources_in_priority_order", async () => {
    const rules = await discoverRules(fixtureRoot);
    const sources = rules.map((rule) => rule.sourcePath);

    expect(sources).toEqual([
      "CONTEXT.md",
      ".dcc/rules/testing.md",
      ".omo/rules/testing-copy.md",
      ".claude/rules/build.md",
      ".cursor/rules/style.mdc",
      ".github/copilot-instructions.md",
      ".github/instructions/security.md",
    ]);
    expect(sources).not.toContain("AGENTS.md");
  });
});
