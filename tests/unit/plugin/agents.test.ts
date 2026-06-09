import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";

const pluginRoot = join(process.cwd(), "plugins/deepseek-codex-combo");
const allowedModels = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

describe("DCC agent profiles", () => {
  it("agent_tomls_use_deepseek_proxy_models", () => {
    const agentDir = join(pluginRoot, "agents");
    const tomlFiles = readdirSync(agentDir).filter((fileName) => fileName.endsWith(".toml"));

    expect(tomlFiles.length).toBeGreaterThanOrEqual(4);

    for (const fileName of tomlFiles) {
      const parsed = parseToml(readFileSync(join(agentDir, fileName), "utf8"));
      expect(isRecord(parsed)).toBe(true);
      if (!isRecord(parsed)) {
        continue;
      }

      const model = readString(parsed, "model");
      const provider = readString(parsed, "model_provider");
      const developerInstructions = readString(parsed, "developer_instructions");

      expect(provider).toBe("deepseek_proxy");
      expect(model === undefined ? false : allowedModels.has(model)).toBe(true);
      expect(developerInstructions?.trim().length ?? 0).toBeGreaterThan(20);
      expect(existsSync(join(agentDir, fileName.replace(/\.toml$/, ".md")))).toBe(true);
    }
  });
});
