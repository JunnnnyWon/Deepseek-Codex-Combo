import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("plugin creator validator", () => {
  it("accepts plugin manifest or fallback is documented", () => {
    const result = spawnSync(
      "python3",
      [
        "/Users/junnnny/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py",
        "plugins/deepseek-codex-combo",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Plugin validation passed");
  });
});
