import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  const dir = await mkdtemp(join(tmpdir(), "dcc-loop-test-"));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("dcc loop", () => {
  it("loop_creates_durable_goal_files", async () => {
    const cwd = await makeTempDir();
    const loopId = "dcc_t17_loop";
    const stateDir = join(cwd, ".dcc", "ulw-loop", loopId);

    const first = runDcc([
      "loop",
      "ship durable task",
      "--cwd",
      cwd,
      "--session-id",
      loopId,
      "--max-steps",
      "0",
    ]);
    expect(first.status).toBe(0);
    const firstOutput = `${first.stdout}\n${first.stderr}`;
    expect(firstOutput).toContain("loop session: dcc_t17_loop");
    expect(firstOutput).toContain("max steps: 0");

    const resume = runDcc(["loop", "--resume", loopId, "--cwd", cwd, "--max-steps", "0"]);
    expect(resume.status).toBe(0);
    const resumeOutput = `${resume.stdout}\n${resume.stderr}`;
    expect(resumeOutput).toContain("resumed");

    const goalsText = await readFile(join(stateDir, "goals.json"), "utf8");
    const evidenceText = await readFile(join(stateDir, "evidence.jsonl"), "utf8");
    const notesText = await readFile(join(stateDir, "notepad.md"), "utf8");

    expect(goalsText).toContain('"task": "ship durable task"');
    expect(evidenceText).toContain('{"event":"started"}');
    expect(evidenceText).toContain('{"event":"resume"}');
    expect(notesText).toContain("ship durable task");
  });
});
