import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("dcc proxy start", () => {
  it("remote_bind_requires_token_auth", () => {
    const result = spawnSync(
      "node",
      ["bin/dcc.mjs", "proxy", "start", "--host", "0.0.0.0", "--port", "47148"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("remote_bind_requires_token_auth");
    expect(output).not.toContain("Authorization");
  });
});
