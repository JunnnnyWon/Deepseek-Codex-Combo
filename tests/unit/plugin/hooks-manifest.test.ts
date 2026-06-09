import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface HookCommand {
  readonly command: string;
  readonly statusMessage: string;
  readonly type: "command";
}

interface HookGroup {
  readonly hooks: readonly HookCommand[];
}

interface HooksManifest {
  readonly hooks: Record<string, readonly HookGroup[]>;
}

const requiredHookEvents = [
  "SessionStart",
  "UserPromptSubmit",
  "PostToolUse",
  "PostCompact",
  "Stop",
  "SubagentStop",
] as const;

describe("hooks manifest", () => {
  it("hook events match spec", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "plugins/deepseek-codex-combo/hooks/hooks.json"), "utf8"),
    ) as HooksManifest;

    expect(Object.keys(manifest.hooks).sort()).toEqual([...requiredHookEvents].sort());
  });

  it("hook commands use dist cli paths and status messages", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "plugins/deepseek-codex-combo/hooks/hooks.json"), "utf8"),
    ) as HooksManifest;

    for (const event of requiredHookEvents) {
      const command = manifest.hooks[event]?.[0]?.hooks[0];
      expect(command).toMatchObject({
        type: "command",
      });
      expect(command?.command).toContain("dist/bin/dcc.mjs hooks");
      expect(command?.statusMessage).toContain("DCC:");
    }
  });
});
