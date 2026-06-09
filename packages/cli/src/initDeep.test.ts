import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInitDeep } from "./initDeep";

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

const productFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "packages/api/package.json",
  "packages/api/.env.example",
  "packages/api/migrations/001_init.sql",
  "packages/api/src/index.ts",
  "packages/api/src/server.ts",
  "packages/api/src/client.ts",
  "packages/api/tests/api.test.ts",
] as const;

const copyFixture = async (fixtureName: string): Promise<string> => {
  const destination = await mkdtemp(join(tmpdir(), "dcc-init-deep-unit-"));
  await cp(join(fixturesRoot, fixtureName), destination, { recursive: true });
  tempRoots.push(destination);
  return destination;
};

const makeTempDir = async (prefix: string): Promise<string> => {
  const cwd = await mkdtemp(join(tmpdir(), prefix));
  tempRoots.push(cwd);
  return cwd;
};

const hashText = (text: string): string => createHash("sha256").update(text).digest("hex");

const readChecksums = async (
  cwd: string,
  paths: readonly string[],
): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    paths.map(async (path) => [path, hashText(await readFile(join(cwd, path), "utf8"))] as const),
  );
  return Object.fromEntries(entries);
};

const readGenerated = async (
  cwd: string,
): Promise<Record<(typeof expectedGeneratedFiles)[number], string>> => {
  const entries = await Promise.all(
    expectedGeneratedFiles.map(
      async (path) => [path, await readFile(join(cwd, path), "utf8")] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<(typeof expectedGeneratedFiles)[number], string>;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("runInitDeep", () => {
  it("generates the expected project memory files", async () => {
    const cwd = await copyFixture("init-deep-monorepo");

    const result = await runInitDeep({ cwd });
    const agents = await readFile(join(cwd, "AGENTS.md"), "utf8");
    const projectIndex = await readFile(join(cwd, ".dcc/project-index.json"), "utf8");

    expect(result.generatedFiles).toEqual(expectedGeneratedFiles);
    expect(result.lines).toEqual(expectedGeneratedFiles.map((path) => `written: ${path}`));
    expect(agents).toContain("<!-- dcc-managed: agents START -->");
    expect(agents).toContain("Project overview");
    expect(projectIndex).toContain("init-deep-monorepo");
  });

  it("reruns idempotently without rewriting generated content", async () => {
    const cwd = await copyFixture("init-deep-monorepo");

    await runInitDeep({ cwd });
    const firstGenerated = await readGenerated(cwd);
    await runInitDeep({ cwd });
    const secondGenerated = await readGenerated(cwd);

    expect(secondGenerated).toEqual(firstGenerated);
  });

  it("preserves product source file checksums", async () => {
    const cwd = await copyFixture("init-deep-monorepo");
    const before = await readChecksums(cwd, productFiles);

    await runInitDeep({ cwd });
    const after = await readChecksums(cwd, productFiles);

    expect(after).toEqual(before);
  });

  it("lists generated files in dry-run mode without writing them", async () => {
    const cwd = await copyFixture("init-deep-monorepo");

    const result = await runInitDeep({ cwd, dryRun: true });

    expect(result.generatedFiles).toEqual(expectedGeneratedFiles);
    expect(result.lines).toEqual(expectedGeneratedFiles.map((path) => `would write: ${path}`));
    await expect(stat(join(cwd, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects missing source context with the required error code", async () => {
    const cwd = await makeTempDir("dcc-init-deep-empty-");

    await expect(runInitDeep({ cwd })).rejects.toThrow("insufficient_source_context");
  });

  it("rejects invalid cwd with the required error code", async () => {
    const cwd = join(tmpdir(), "dcc-init-deep-missing-cwd");

    await expect(runInitDeep({ cwd, dryRun: true })).rejects.toThrow("invalid_cwd");
  });

  it("rejects generated-file write conflicts", async () => {
    const cwd = await makeTempDir("dcc-init-deep-conflict-");
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "package.json"), '{"name":"conflict-fixture"}\n', "utf8");
    await writeFile(join(cwd, "src/index.ts"), "export const ok = true;\n", "utf8");
    await mkdir(join(cwd, "AGENTS.md"));

    await expect(runInitDeep({ cwd })).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("creates nested AGENTS files for large subdirectories", async () => {
    const cwd = await makeTempDir("dcc-init-deep-nested-");
    await mkdir(join(cwd, "src", "large"), { recursive: true });
    await writeFile(
      join(cwd, "package.json"),
      '{"name":"nested-fixture","scripts":{"test":"vitest run"}}\n',
      "utf8",
    );
    await writeFile(join(cwd, "src/index.ts"), "export const rootValue = 1;\n", "utf8");

    for (let index = 0; index < 40; index += 1) {
      await writeFile(
        join(cwd, "src", "large", `file-${index}.ts`),
        `export const value${index} = ${index};\n`,
        "utf8",
      );
    }

    const result = await runInitDeep({ cwd });
    const nestedAgents = await readFile(join(cwd, "src", "large", "AGENTS.md"), "utf8");

    expect(result.lines).toContain("written: src/large/AGENTS.md");
    expect(result.generatedFiles).toContain("src/large/AGENTS.md");
    expect(nestedAgents).toContain("<!-- dcc-managed: agents START -->");
    expect(nestedAgents).toContain("Directory Memory");
  });
});
