import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runDcc = (args: string[], cwd: string) =>
  spawnSync(process.execPath, ["bin/dcc.mjs", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 10_000,
  });

describe("dcc orchestration", () => {
  it("plan_creates_plan_file_without_product_diff", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-plan-flow-"));
    const result = runDcc(
      ["plan", "add health endpoint", "--cwd", cwd, "--no-edit"],
      process.cwd(),
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("plans/");
    expect(output).toContain("inactive");
    expect(await readFile(join(cwd, "plans", "add-health-endpoint.md"), "utf8")).toContain(
      "# Plan:",
    );
    expect(await readFile(join(cwd, ".dcc", "boulder.json"), "utf8")).toContain("inactivePlans");
  });

  it("start_work_refuses_plan_without_qa_scenarios", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-start-work-flow-"));
    await mkdir(join(cwd, "plans"), { recursive: true });
    await writeFile(
      join(cwd, "plans", "no-qa.md"),
      [
        "# Plan: No QA",
        "## Goal",
        "Exercise the refusal path.",
        "## Execution checklist",
        "- [ ] 1. do work",
      ].join("\n"),
      "utf8",
    );

    const result = runDcc(
      ["start-work", "plans/no-qa.md", "--cwd", cwd, "--dry-run"],
      process.cwd(),
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("missing_qa_scenario");
  });

  it("loop_creates_durable_state_and_verify_completes_with_evidence", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-loop-flow-"));
    const loopId = "dcc_t17_loop";
    await mkdir(join(cwd, ".dcc", "ulw-loop", loopId), { recursive: true });

    const first = runDcc(
      ["loop", "ship durable task", "--cwd", cwd, "--session-id", loopId, "--max-steps", "0"],
      process.cwd(),
    );
    expect(first.status).toBe(0);
    const firstOutput = `${first.stdout}\n${first.stderr}`;
    expect(firstOutput).toContain("loop session: dcc_t17_loop");
    expect(firstOutput).toContain("max steps: 0");

    const resume = runDcc(
      ["loop", "--resume", loopId, "--cwd", cwd, "--max-steps", "0"],
      process.cwd(),
    );
    expect(resume.status).toBe(0);
    const resumeOutput = `${resume.stdout}\n${resume.stderr}`;
    expect(resumeOutput).toContain("resumed");

    expect(await readFile(join(cwd, ".dcc", "ulw-loop", loopId, "goals.json"), "utf8")).toContain(
      '"task": "ship durable task"',
    );
    expect(
      await readFile(join(cwd, ".dcc", "ulw-loop", loopId, "evidence.jsonl"), "utf8"),
    ).toContain('{"event":"started"}');
    expect(
      await readFile(join(cwd, ".dcc", "ulw-loop", loopId, "evidence.jsonl"), "utf8"),
    ).toContain('{"event":"resume"}');
    expect(await readFile(join(cwd, ".dcc", "ulw-loop", loopId, "notepad.md"), "utf8")).toContain(
      "ship durable task",
    );
    await appendFile(
      join(cwd, ".dcc", "ulw-loop", loopId, "evidence.jsonl"),
      '{"status":"pass","source":"e2e-loop"}\n',
      "utf8",
    );

    const verify = runDcc(
      ["start-work", "verify", "--cwd", cwd, "--session-id", loopId],
      process.cwd(),
    );
    const verifyOutput = `${verify.stdout}\n${verify.stderr}`;
    expect(verify.status).toBe(0);
    expect(verifyOutput).toContain("DCC_VERIFICATION_COMPLETE");
  });

  it("loop_resume_appends_started_and_resume_events_when_missing_started", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-loop-resume-missing-started-"));
    const loopId = "dcc_t17_loop_resume";
    const root = join(cwd, ".dcc", "ulw-loop", loopId);
    const evidencePath = join(root, "evidence.jsonl");
    await mkdir(root, { recursive: true });

    await writeFile(join(root, "goals.json"), JSON.stringify({ version: 1 }, null, 2), "utf8");
    await writeFile(join(root, "notepad.md"), "ship durable task\n", "utf8");
    await writeFile(evidencePath, "", "utf8");

    const resume = runDcc(
      ["loop", "--resume", loopId, "--cwd", cwd, "--max-steps", "0"],
      process.cwd(),
    );
    expect(resume.status).toBe(0);

    const evidence = await readFile(evidencePath, "utf8");
    expect(evidence).toContain('{"event":"started"}');
    expect(evidence).toContain('{"event":"resume"}');
    expect(evidence.indexOf('{"event":"started"}')).toBeLessThan(
      evidence.indexOf('{"event":"resume"}'),
    );
  });
});
