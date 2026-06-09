import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempHome } from "../../harness/temp-home";

const envValue = (env: NodeJS.ProcessEnv, key: "CODEX_HOME" | "HOME"): string | undefined =>
  env[key];

describe("temp home harness", () => {
  it("temp_home_is_isolated", async () => {
    const first = await createTempHome("first");
    const second = await createTempHome("second");
    let firstCleaned = false;

    try {
      expect(first.home).not.toBe(second.home);
      expect(first.codexHome).toBe(join(first.home, ".codex"));
      expect(envValue(first.env, "HOME")).toBe(first.home);
      expect(envValue(first.env, "CODEX_HOME")).toBe(first.codexHome);
      expect(existsSync(first.codexHome)).toBe(true);
      expect(existsSync(second.codexHome)).toBe(true);

      await writeFile(join(first.codexHome, "config.toml"), 'profile = "first"\n');

      expect(await readFile(join(first.codexHome, "config.toml"), "utf8")).toContain("first");
      expect(existsSync(join(second.codexHome, "config.toml"))).toBe(false);

      await first.cleanup();
      firstCleaned = true;
      expect(existsSync(first.home)).toBe(false);
    } finally {
      if (!firstCleaned) {
        await first.cleanup();
      }
      await second.cleanup();
    }
  });
});
