import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInitDeep } from "../../../packages/cli/src/initDeep.ts";

const tempRoots: string[] = [];
const fixturesRoot = join(process.cwd(), "tests", "fixtures");
const expectedGeneratedFiles = [
  "AGENTS.md",
  ".dcc/project-index.json",
  ".dcc/rules/coding-style.md",
  ".dcc/rules/testing.md",
  ".dcc/rules/architecture.md",
  ".dcc/rules/security.md",
  ".dcc/memory/root-summary.md",
  ".dcc/memory/package-map.md",
  ".dcc/memory/risk-map.md",
] as const;

const copyFixture = async (fixtureName: string): Promise<string> => {
  const destination = await mkdtemp(join(tmpdir(), "dcc-init-deep-test-"));
  await cp(join(fixturesRoot, fixtureName), destination, { recursive: true });
  tempRoots.push(destination);
  return destination;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("runInitDeep", () => {
  it("creates the expected core files and surfaces uncertainty explicitly", async () => {
    const cwd = await copyFixture("ts-node-app");

    const result = await runInitDeep({ cwd });
    const projectIndex = JSON.parse(
      await readFile(join(cwd, ".dcc", "project-index.json"), "utf8"),
    ) as {
      readonly packages: readonly {
        readonly commands: readonly string[];
        readonly kind: string;
        readonly name: string;
        readonly path: string;
      }[];
      readonly uncertainty: readonly string[];
    };

    expect(result.lines).toEqual(expectedGeneratedFiles.map((file) => `written: ${file}`));
    expect(projectIndex.packages.some((pkg) => pkg.path === ".")).toBe(true);
    expect(projectIndex.uncertainty).toContain(
      "No test files were detected; validate expectations before using generated testing guidance.",
    );
  });

  it("does not overwrite unmanaged notes inside generated dcc files on rerun", async () => {
    const cwd = await copyFixture("ts-node-app");

    await runInitDeep({ cwd });

    const testingRulePath = join(cwd, ".dcc", "rules", "testing.md");
    const originalTestingRule = await readFile(testingRulePath, "utf8");
    await writeFile(
      testingRulePath,
      `${originalTestingRule}\n\n## Local Notes\n- keep this hand-written note\n`,
      "utf8",
    );

    await runInitDeep({ cwd });

    const post = await readFile(testingRulePath, "utf8");
    expect(post).toContain("## Local Notes");
    expect(post).toContain("- keep this hand-written note");
    expect(post.match(/dcc-managed: rules-testing START/g)?.length ?? 0).toBe(1);
  });

  it("discovers nested package boundaries and keeps paths relative in project index", async () => {
    const cwd = await copyFixture("nested-packages");

    await runInitDeep({ cwd });

    const projectIndex = JSON.parse(
      await readFile(join(cwd, ".dcc", "project-index.json"), "utf8"),
    ) as {
      readonly packages: readonly {
        readonly commands: readonly string[];
        readonly kind: string;
        readonly name: string;
        readonly path: string;
      }[];
      readonly uncertainty: readonly string[];
    };

    expect(projectIndex.packages.map((pkg) => pkg.path)).toEqual([
      ".",
      "packages/python-worker",
      "packages/web-app",
    ]);
    expect(projectIndex.uncertainty).toContain(
      "pyproject.toml scripts could not be parsed for build/test commands.",
    );
  });

  it("rejects generated-only inputs", async () => {
    const cwd = await copyFixture("generated-only");

    await expect(runInitDeep({ cwd, dryRun: true })).rejects.toThrow("insufficient_source_context");
  });
});
