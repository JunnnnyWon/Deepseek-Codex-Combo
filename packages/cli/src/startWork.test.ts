import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const dir = await mkdtemp(join(tmpdir(), "dcc-start-work-test-"));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("dcc start-work", () => {
  it("start_work_refuses_missing_qa", async () => {
    const cwd = await makeTempDir();
    const planPath = join(cwd, "plans", "no-qa.md");

    await mkdir(join(cwd, "plans"), { recursive: true });
    await writeFile(
      planPath,
      [
        "# Plan: No QA",
        "## Goal",
        "Exercise refusal path.",
        "## Execution checklist",
        "- [ ] 1. do work",
      ].join("\n"),
      "utf8",
    );

    const result = runDcc(["start-work", "plans/no-qa.md", "--cwd", cwd, "--dry-run"]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("missing_qa_scenario");
    expect(await readFile(planPath, "utf8")).toContain("- [ ] 1.");
  });

  it("start_work_registers_state_and_leaves_checklist_unchanged", async () => {
    const cwd = await makeTempDir();
    const planPath = join(cwd, "plans", "with-qa.md");

    await mkdir(join(cwd, "plans"), { recursive: true });
    await writeFile(
      planPath,
      [
        "# Plan: With QA",
        "## Goal",
        "Add an endpoint and verify by a health check.",
        "## Execution checklist",
        "- [ ] 1. implement endpoint",
        "## Verification matrix",
        "- Scenario: health endpoint returns 200",
      ].join("\n"),
      "utf8",
    );

    const result = runDcc([
      "start-work",
      "plans/with-qa.md",
      "--cwd",
      cwd,
      "--session-id",
      "dcc_t17",
    ]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("start-work active: dcc_t17");
    expect(output).toContain("evidence dir:");
    const boulder = await readFile(join(cwd, ".dcc", "boulder.json"), "utf8");
    expect(boulder.length).toBeGreaterThan(0);

    const planText = await readFile(planPath, "utf8");
    expect(planText).toContain("- [ ] 1. implement endpoint");
  });
});
