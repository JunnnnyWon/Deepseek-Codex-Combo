import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("contract live gating", () => {
  it("allows offline contract verification without DeepSeek credentials", () => {
    const result = spawnSync("node", ["bin/dcc.mjs", "contracts", "verify", "--offline"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DEEPSEEK_API_KEY: "" },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Codex contract: ok");
    expect(result.stdout).toContain("DeepSeek contract: ok");
    expect(result.stdout).toContain("live: skipped");
  });

  it("blocks live contract checks unless --live is explicit", () => {
    const result = spawnSync("node", ["bin/dcc.mjs", "contracts", "verify"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, DEEPSEEK_API_KEY: "test" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('live checks require "--live"');
  });
});
