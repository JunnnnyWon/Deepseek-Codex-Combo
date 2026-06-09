import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];
const repoRoot = process.cwd();
const fixturesRoot = join(repoRoot, "tests", "fixtures");
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

const runDcc = (args: readonly string[]) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
  });

const copyFixture = async (fixtureName: string): Promise<string> => {
  const cwd = await mkdtemp(join(tmpdir(), "dcc-init-deep-e2e-"));
  await cp(join(fixturesRoot, fixtureName), cwd, { recursive: true });
  tempRoots.push(cwd);
  return cwd;
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

describe("dcc init-deep", () => {
  it("generates project memory files and preserves product checksums", async () => {
    const cwd = await copyFixture("init-deep-monorepo");
    const beforeProduct = await readChecksums(cwd, productFiles);

    const result = runDcc(["init-deep", "--cwd", cwd]);
    const output = `${result.stdout}\n${result.stderr}`;
    const afterProduct = await readChecksums(cwd, productFiles);
    const agents = await readFile(join(cwd, "AGENTS.md"), "utf8");

    expect(result.status).toBe(0);
    expect(output).toContain("generated files (9):");
    for (const filePath of expectedGeneratedFiles) {
      expect(output).toContain(`written: ${filePath}`);
      expect(output).toContain(`- ${filePath}`);
    }
    expect(agents).toContain("<!-- dcc-managed: agents START -->");
    expect(agents).toContain("Project overview");
    expect(afterProduct).toEqual(beforeProduct);
  });

  it("reruns idempotently while preserving unmanaged AGENTS notes", async () => {
    const cwd = await copyFixture("init-deep-monorepo");
    const first = runDcc(["init-deep", "--cwd", cwd]);
    expect(first.status).toBe(0);

    const agentsPath = join(cwd, "AGENTS.md");
    const originalAgents = await readFile(agentsPath, "utf8");
    await writeFile(
      agentsPath,
      `${originalAgents}\n\n## Team Notes\n- keep cli smoke checks local\n`,
      "utf8",
    );

    const generatedAfterUserEdit = await readGenerated(cwd);
    const second = runDcc(["init-deep", "--cwd", cwd]);
    const generatedAfterRerun = await readGenerated(cwd);
    const postAgents = await readFile(agentsPath, "utf8");

    expect(second.status).toBe(0);
    expect(postAgents).toContain("## Team Notes");
    expect(postAgents).toContain("- keep cli smoke checks local");
    expect(generatedAfterRerun).toEqual(generatedAfterUserEdit);
  });

  it("prints generated file list in dry-run mode without writing files", async () => {
    const cwd = await copyFixture("init-deep-monorepo");

    const result = runDcc(["init-deep", "--cwd", cwd, "--dry-run"]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("generated files (9):");
    for (const filePath of expectedGeneratedFiles) {
      expect(output).toContain(`would write: ${filePath}`);
      expect(output).toContain(`- ${filePath}`);
    }
    await expect(stat(join(cwd, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("errors for missing source roots", async () => {
    const cwd = await makeTempDir("dcc-init-deep-empty-");

    const result = runDcc(["init-deep", "--cwd", cwd]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("insufficient_source_context");
    expect(output).not.toContain("generated files");
  });

  it("rejects conflict when a generated file path is not writable", async () => {
    const cwd = await makeTempDir("dcc-init-deep-conflict-");
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "package.json"), '{"name":"x"}\n', "utf8");
    await writeFile(join(cwd, "src/index.ts"), "export const ok = true;\n", "utf8");
    await mkdir(join(cwd, "AGENTS.md"));

    const result = runDcc(["init-deep", "--cwd", cwd]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("file_write_conflict");
    expect(output).not.toContain("generated files");
  });

  it("reports invalid cwd for missing directories", () => {
    const result = runDcc(["init-deep", "--cwd", "/does/not/exist", "--dry-run"]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("invalid_cwd");
    expect(output).not.toContain("generated files");
  });
});
