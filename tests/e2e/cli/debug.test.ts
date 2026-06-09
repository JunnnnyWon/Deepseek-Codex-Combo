import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("dcc debug helpers", () => {
  it("redacts sample secrets and paths", () => {
    const homePath = "/Users/example";
    const result = spawnSync(
      "node",
      [
        "bin/dcc.mjs",
        "debug",
        "redact",
        "--sample-secret",
        "sk-test",
        "--sample-path",
        `${homePath}/private.ts`,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, HOME: homePath },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[REDACTED]");
    expect(result.stdout).not.toContain("sk-test");
    expect(result.stdout).not.toContain(`${homePath}/private.ts`);
  });

  it("rejects broken managed block fixtures", () => {
    const result = spawnSync(
      "node",
      [
        "bin/dcc.mjs",
        "debug",
        "patch-config",
        "--fixture",
        "tests/fixtures/config/broken-managed-block.toml",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("config_parse_error");
  });
});
