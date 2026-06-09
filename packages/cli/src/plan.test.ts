import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];
const repoRoot = process.cwd();
const runDcc = (args: string[]) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
  });

const makeTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "dcc-plan-test-"));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("dcc plan", () => {
  it("plan_creates_plan_without_product_diff", async () => {
    const cwd = await makeTempDir();
    const packagePath = join(cwd, "package.json");
    const sourcePath = join(cwd, "src", "index.ts");

    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      packagePath,
      JSON.stringify({ name: "example-service", private: true }, null, 2),
      "utf8",
    );
    const sourceCode = 'export const ok = () => "healthy";\n';
    await writeFile(sourcePath, sourceCode, "utf8");

    const beforePackage = await readFile(packagePath, "utf8");
    const beforeSource = await readFile(sourcePath, "utf8");

    const result = runDcc(["plan", "add health endpoint", "--cwd", cwd, "--no-edit"]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("plans/");

    const planEntries = await readdir(join(cwd, "plans"));
    const planEntry = planEntries.find((entry) => entry.endsWith(".md"));
    expect(planEntry).not.toBeUndefined();
    if (planEntry === undefined) {
      return;
    }

    const planPath = join(cwd, "plans", planEntry);
    const planText = await readFile(planPath, "utf8");
    expect(planText).toContain("# Plan:");
    expect(planText).toContain("## Verification matrix");

    const afterPackage = await readFile(packagePath, "utf8");
    const afterSource = await readFile(sourcePath, "utf8");
    expect(afterPackage).toBe(beforePackage);
    expect(afterSource).toBe(beforeSource);
  });
});
