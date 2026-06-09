import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface SkillAliasFixture {
  readonly alias: string;
  readonly target: string;
}

type SkillAliasFixtures = readonly SkillAliasFixture[];

const pluginRoot = join(process.cwd(), "plugins/deepseek-codex-combo");

const parseAliasBlock = (content: string): readonly string[] => {
  const yamlBlockMatch = content.match(/^aliases:\s*\n((?:\s*-\s*.*\n?)+)/m);
  if (yamlBlockMatch === null || yamlBlockMatch[1] === undefined) {
    return [];
  }
  return yamlBlockMatch[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^-+\s*/, ""))
    .map((line) => line.replace(/["']/g, ""));
};

const aliasFixtures = (): SkillAliasFixtures => [
  { alias: "$ulw-plan", target: "skills/dcc-plan/SKILL.md" },
  { alias: "$start-work", target: "skills/dcc-start-work/SKILL.md" },
  { alias: "$ulw-loop", target: "skills/dcc-loop/SKILL.md" },
  { alias: "ultrawork", target: "skills/dcc-ultrawork/SKILL.md" },
  { alias: "ulw", target: "skills/dcc-ultrawork/SKILL.md" },
];

describe("DCC alias routing", () => {
  it("all_skill_files_have_frontmatter_and_no_placeholders", () => {
    const skillNames = [
      "dcc-ast-grep",
      "dcc-comment-checker",
      "dcc-executor",
      "dcc-frontend-ui-ux",
      "dcc-init-deep",
      "dcc-librarian",
      "dcc-loop",
      "dcc-lsp",
      "dcc-plan",
      "dcc-programming",
      "dcc-remove-ai-slops",
      "dcc-review-work",
      "dcc-rules",
      "dcc-start-work",
      "dcc-ultrawork",
      "dcc-verifier",
    ];

    for (const skillName of skillNames) {
      const skillPath = join(pluginRoot, "skills", skillName, "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, "utf8");

      expect(content.startsWith("---\n")).toBe(true);
      expect(content).toContain(`name: ${skillName}`);
      expect(content).toContain("description:");
      expect(content).not.toMatch(/\bTODO\b|placeholder/i);
    }
  });

  it("all_alias_skills_exist_and_route_to_dcc", () => {
    for (const { alias, target } of aliasFixtures()) {
      const targetPath = join(pluginRoot, target);
      expect(existsSync(targetPath)).toBe(true);

      const content = readFileSync(targetPath, "utf8");
      const aliases = parseAliasBlock(content);

      expect(aliases).toContain(alias);
      expect(content).toContain(`alias ${alias}`);
      expect(content).toContain("dcc");
      expect(content).toContain("DeepSeek");
    }
  });
});
