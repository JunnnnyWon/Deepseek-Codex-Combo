import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  const dir = await mkdtemp(join(tmpdir(), "dcc-verifier-test-"));
  tempRoots.push(dir);
  return dir;
};

afterEach(async () => {
  const roots = tempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

describe("start-work verifier", () => {
  it("verification_complete_requires_evidence", async () => {
    const cwd = await makeTempDir();
    const loopId = "dcc_t17_loop";
    const loopDir = join(cwd, ".dcc", "ulw-loop", loopId);
    const evidencePath = join(loopDir, "evidence.jsonl");

    await mkdir(loopDir, { recursive: true });
    await writeFile(join(loopDir, "goals.json"), JSON.stringify({ version: 1 }, null, 2), "utf8");
    await writeFile(join(loopDir, "notepad.md"), "ship durable task\n", "utf8");
    await writeFile(evidencePath, "", "utf8");

    const failing = runDcc(["start-work", "verify", "--cwd", cwd, "--session-id", loopId]);
    const failingOutput = `${failing.stdout}\n${failing.stderr}`;

    expect(failing.status).not.toBe(0);
    expect(failingOutput).toContain("verification_evidence_required");

    await appendFile(evidencePath, '{"status":"pass","source":"manual-test"}\n', "utf8");

    const passing = runDcc(["start-work", "verify", "--cwd", cwd, "--session-id", loopId]);
    const passingOutput = `${passing.stdout}\n${passing.stderr}`;

    expect(passing.status).toBe(0);
    expect(passingOutput).toContain("DCC_VERIFICATION_COMPLETE");

    const evidence = await readFile(evidencePath, "utf8");
    expect(evidence).toContain('{"status":"pass","source":"manual-test"}');
  });

  it("verification_completes_with_resume_marked_evidence", async () => {
    const cwd = await makeTempDir();
    const loopId = "dcc_t17_loop_markers";
    const loopDir = join(cwd, ".dcc", "ulw-loop", loopId);
    const evidencePath = join(loopDir, "evidence.jsonl");

    await mkdir(loopDir, { recursive: true });
    await writeFile(join(loopDir, "goals.json"), JSON.stringify({ version: 1 }, null, 2), "utf8");
    await writeFile(join(loopDir, "notepad.md"), "ship durable task\n", "utf8");
    await writeFile(
      evidencePath,
      `${['{"event":"started"}', '{"event":"resume"}', '{"status":"pass"}'].join("\n")}\n`,
      "utf8",
    );

    const passing = runDcc(["start-work", "verify", "--cwd", cwd, "--session-id", loopId]);
    const passingOutput = `${passing.stdout}\n${passing.stderr}`;

    expect(passing.status).toBe(0);
    expect(passingOutput).toContain("DCC_VERIFICATION_COMPLETE");
    const evidence = await readFile(evidencePath, "utf8");
    expect(evidence).toContain('{"event":"started"}');
    expect(evidence).toContain('{"event":"resume"}');
  });
});
