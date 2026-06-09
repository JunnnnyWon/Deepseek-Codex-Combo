import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hooks CLI", () => {
  it("post_tool_use_blocks_slop_comment", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "hooks",
        "post-tool-use",
        "--fixture",
        "tests/fixtures/hooks/slop-comment.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(2);
    expect(output).toContain("Checking Comments");
    expect(output).toContain("ai_slop_comment");
  });

  it("user_prompt_submit_omits_raw_prompt", () => {
    const result = spawnSync(
      process.execPath,
      [
        "bin/dcc.mjs",
        "hooks",
        "user-prompt-submit",
        "--fixture",
        "tests/fixtures/hooks/prompt-with-secret.json",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("workflow directive: ultrawork");
    expect(output).toContain("model route: category=ultrawork model=deepseek-v4-pro");
    expect(output).toContain("agent route: use=dcc-worker-pro");
    expect(output).not.toContain("sk-secret-123");
    expect(output).not.toContain("do not echo this raw prompt");
  });

  it("stop_blocks_incomplete_boulder_state", () => {
    const result = spawnSync(
      process.execPath,
      ["bin/dcc.mjs", "hooks", "stop", "--fixture", "tests/fixtures/boulder/incomplete-plan.json"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 5_000,
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(2);
    expect(output).toContain('"decision":"block"');
    expect(output).toContain("missing_evidence");
    expect(output).toContain("A1");
  });

  it("post_tool_use_reads_payload_from_stdin", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "hooks", "post-tool-use"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: readFileSync("tests/fixtures/hooks/slop-comment.json"),
      timeout: 5_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(2);
    expect(output).toContain("Checking Comments");
    expect(output).toContain("ai_slop_comment");
  });

  it("malformed_stdin_payload_fails_closed", () => {
    const result = spawnSync(process.execPath, ["bin/dcc.mjs", "hooks", "post-tool-use"], {
      cwd: process.cwd(),
      encoding: "utf8",
      input: "{bad",
      timeout: 5_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("hooks_failed: hook_fixture_invalid");
  });
});
