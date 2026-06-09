import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PluginManifest {
  readonly hooks?: unknown;
  readonly interface: {
    readonly defaultPrompt: readonly string[];
    readonly longDescription: string;
  };
  readonly mcpServers: string;
  readonly name: string;
  readonly skills: string;
}

interface McpServerDeclaration {
  readonly args: readonly string[];
  readonly command: string;
  readonly env?: {
    readonly DCC_LSP_TIMEOUT_MS?: string;
  };
}

interface McpManifest {
  readonly mcpServers: Record<string, McpServerDeclaration>;
}

const pluginRoot = join(process.cwd(), "plugins/deepseek-codex-combo");

const readManifest = (): PluginManifest =>
  JSON.parse(readFileSync(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8")) as PluginManifest;

describe("plugin manifest", () => {
  it("matches validator-compatible spec shape and documents hook fallback", () => {
    const manifest = readManifest();

    expect(manifest.name).toBe("deepseek-codex-combo");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.mcpServers).toBe("./.mcp.json");
    expect(manifest.hooks).toBeUndefined();
    expect(manifest.interface.longDescription.length).toBeGreaterThan(20);
    expect(manifest.interface.defaultPrompt.length).toBeGreaterThan(0);
    expect(existsSync(join(process.cwd(), "docs/plugin-hook-fallback.md"))).toBe(true);
  });

  it("declares the bundled mcp server commands", () => {
    const mcp = JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf8")) as McpManifest;
    const lspServer = mcp.mcpServers["dcc-lsp"];
    const astGrepServer = mcp.mcpServers["dcc-ast-grep"];
    const hashlineServer = mcp.mcpServers["dcc-hashline"];
    const pluginRootDistCli = "$" + "{PLUGIN_ROOT}/dist/bin/dcc.mjs";

    expect(Object.keys(mcp.mcpServers)).toEqual(["dcc-lsp", "dcc-ast-grep", "dcc-hashline"]);
    expect(lspServer).toMatchObject({
      command: "node",
      env: {
        DCC_LSP_TIMEOUT_MS: "10000",
      },
    });
    expect(lspServer?.args).toEqual([pluginRootDistCli, "lsp", "mcp"]);
    expect(astGrepServer).toMatchObject({
      command: "node",
    });
    expect(astGrepServer?.args).toEqual([pluginRootDistCli, "ast-grep", "mcp"]);
    expect(hashlineServer).toMatchObject({
      command: "node",
    });
    expect(hashlineServer?.args).toEqual([pluginRootDistCli, "hashline", "mcp"]);
  });

  it("packaging surface includes skills mcp hooks agents and assets", () => {
    const requiredPaths = [
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "hooks/hooks.json",
      "skills/dcc-plan/SKILL.md",
      "agents/dcc-planner-pro.toml",
      "assets/.gitkeep",
    ];

    const missing = requiredPaths.filter((candidate) => !existsSync(join(pluginRoot, candidate)));

    expect(missing).toEqual([]);
  });
});
