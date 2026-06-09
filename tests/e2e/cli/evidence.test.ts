import { spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("evidence CLI", () => {
  it("rejects_second_active_session_without_explicit_id", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "dcc-evidence-cli-"));
    const first = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "evidence", "start", "--cwd", cwd, "--plan", "plans/a.md"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const second = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "evidence", "start", "--cwd", cwd, "--plan", "plans/b.md"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${second.stdout}\n${second.stderr}`;

    expect(first.status).toBe(0);
    expect(first.stdout).toContain(".dcc/evidence/");
    expect(second.status).toBe(1);
    expect(output).toContain("active_session_exists");
  });
});
