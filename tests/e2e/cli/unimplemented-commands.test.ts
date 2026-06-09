import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempRoots: string[] = [];
const repoRoot = process.cwd();
const runDcc = (args: string[], cwd = repoRoot) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 5_000,
  });

const makeTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "dcc-command-smoke-"));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("dcc orchestration command coverage", () => {
  it("routes plan, start-work, and loop through implemented commands", async () => {
    const cwd = await makeTempDir();

    const plan = runDcc(["plan", "add health endpoint", "--cwd", cwd, "--no-edit"]);
    const planOutput = `${plan.stdout}\n${plan.stderr}`;
    expect(plan.status).toBe(0);
    expect(planOutput).toContain("plan created:");
    expect(planOutput).not.toContain("unknown command");

    const startWork = runDcc([
      "start-work",
      "plans/add-health-endpoint.md",
      "--cwd",
      cwd,
      "--dry-run",
    ]);
    const startWorkOutput = `${startWork.stdout}\n${startWork.stderr}`;
    expect(startWork.status).toBe(0);
    expect(startWorkOutput).toContain("start-work dry-run:");
    expect(startWorkOutput).not.toContain("unknown command");

    const loop = runDcc([
      "loop",
      "ship durable task",
      "--cwd",
      cwd,
      "--session-id",
      "dcc_t17_loop",
      "--max-steps",
      "0",
    ]);
    const loopOutput = `${loop.stdout}\n${loop.stderr}`;
    expect(loop.status).toBe(0);
    expect(loopOutput).toContain("loop session:");
    expect(loopOutput).toContain("max steps: 0");
    expect(loopOutput).not.toContain("unknown command");
  });
});
