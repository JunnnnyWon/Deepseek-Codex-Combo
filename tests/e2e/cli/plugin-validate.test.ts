import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("dcc plugin validate", () => {
  it("bad-agent-model fixture fails on unknown DeepSeek model", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "plugin", "validate", "--fixture", "tests/fixtures/plugin/bad-agent-model"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown_deepseek_model");
  });

  it("fails when hooks file is missing", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "plugin", "validate", "--fixture", "tests/fixtures/plugin/missing-hooks"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("hooks_required");
  });
});
