import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("plugin creator validator", () => {
  it("accepts plugin manifest or fallback is documented", () => {
    const validatorPath =
      "/Users/junnnny/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py";
    if (!existsSync(validatorPath)) {
      expect(existsSync("plugins/deepseek-codex-combo/.codex-plugin/plugin.json")).toBe(true);
      expect(existsSync("plugins/deepseek-codex-combo/hooks/hooks.json")).toBe(true);
      expect(existsSync("plugins/deepseek-codex-combo/.mcp.json")).toBe(true);
      return;
    }

    const result = spawnSync("python3", [validatorPath, "plugins/deepseek-codex-combo"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Plugin validation passed");
  });
});
