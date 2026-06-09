import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withPluginDistLock } from "../../harness/pluginDistLock.ts";

const mcpServerNames = ["dcc-lsp", "dcc-ast-grep", "dcc-hashline"] as const;
const pluginRootPlaceholder = "$" + "{PLUGIN_ROOT}";

const mcpServerNameSchema = z.enum(mcpServerNames);
const mcpServerSchema = z.object({
  args: z.array(z.string().min(1)).min(1),
  command: z.string().min(1),
  env: z.record(z.string(), z.string()).optional(),
});
const mcpManifestSchema = z.object({
  mcpServers: z.record(mcpServerNameSchema, mcpServerSchema),
});
const toolListResponseSchema = z.object({
  result: z.object({
    tools: z.array(z.object({ name: z.string().min(1) })),
  }),
});
const rewriteResponseSchema = z.object({
  result: z.object({
    dryRun: z.literal(true),
    matchCount: z.number(),
  }),
});
const hashlineApplyResponseSchema = z.object({
  result: z.object({
    applied: z.literal(false),
    reason: z.literal("hash_mismatch"),
    refreshSuggested: z.literal(true),
  }),
});

type McpServerName = (typeof mcpServerNames)[number];
type McpManifest = z.infer<typeof mcpManifestSchema>;

const expectedTools: Readonly<Record<McpServerName, readonly string[]>> = {
  "dcc-ast-grep": ["ast_grep.list_languages", "ast_grep.search", "ast_grep.rewrite"],
  "dcc-hashline": ["hashline.read", "hashline.apply_patch", "hashline.verify"],
  "dcc-lsp": [
    "lsp.status",
    "lsp.diagnostics",
    "lsp.goto_definition",
    "lsp.find_references",
    "lsp.symbols",
    "lsp.prepare_rename",
    "lsp.rename",
  ],
};

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const installPluginIntoTempHome = (): { readonly home: string; readonly pluginRoot: string } => {
  const home = mkdtempSync(join(tmpdir(), "dcc-mcp-home-"));
  const pluginRoot = join(home, ".codex", "plugins", "deepseek-codex-combo");
  mkdirSync(dirname(pluginRoot), { recursive: true });
  withPluginDistLock(() =>
    cpSync(join(process.cwd(), "plugins", "deepseek-codex-combo"), pluginRoot, {
      recursive: true,
    }),
  );
  return { home, pluginRoot };
};

const readInstalledMcpManifest = (pluginRoot: string): McpManifest =>
  mcpManifestSchema.parse(JSON.parse(readFileSync(join(pluginRoot, ".mcp.json"), "utf8")));

const resolveArgs = (args: readonly string[], pluginRoot: string): readonly string[] =>
  args.map((arg) => arg.replace(pluginRootPlaceholder, pluginRoot));

const runMcp = (
  manifest: McpManifest,
  serverName: McpServerName,
  pluginRoot: string,
  input: readonly Record<string, unknown>[],
): readonly string[] => {
  const server = manifest.mcpServers[serverName];
  const result = spawnSync(server.command, resolveArgs(server.args, pluginRoot), {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...(server.env ?? {}), PLUGIN_ROOT: pluginRoot },
    input: `${input.map((line) => JSON.stringify(line)).join("\n")}\n`,
    timeout: 5_000,
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);
};

const initializeAndListTools = [
  { id: 1, jsonrpc: "2.0", method: "initialize" },
  { id: 2, jsonrpc: "2.0", method: "tools/list" },
] as const;

describe("installed plugin MCP runtime", () => {
  it("manifest_mcp_servers_initialize_and_list_tools_from_copied_runtime", () => {
    const build = spawnSync(pnpmBin, ["--filter", "@deepseek-codex-combo/codex-plugin", "build"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(build.status).toBe(0);

    const install = installPluginIntoTempHome();
    try {
      const manifest = readInstalledMcpManifest(install.pluginRoot);
      for (const serverName of mcpServerNames) {
        const lines = runMcp(manifest, serverName, install.pluginRoot, initializeAndListTools);
        expect(lines).toHaveLength(2);
        const toolsResponse = toolListResponseSchema.parse(JSON.parse(lines[1] ?? ""));
        expect(toolsResponse.result.tools.map((tool) => tool.name)).toEqual(
          expectedTools[serverName],
        );
      }
    } finally {
      rmSync(install.home, { force: true, recursive: true });
    }
  }, 20_000);

  it("installed_ast_grep_and_hashline_mcp_tools_fail_safe", () => {
    const install = installPluginIntoTempHome();
    const workspace = mkdtempSync(join(tmpdir(), "dcc-mcp-workspace-"));
    try {
      const manifest = readInstalledMcpManifest(install.pluginRoot);
      const fixturePath = join(workspace, "index.ts");
      const patchPath = join(workspace, "stale.patch");
      const before = "console.log('hello')\n";
      writeFileSync(fixturePath, before, "utf8");
      writeFileSync(patchPath, "@@ L1#00000000\n- alpha\n+ omega\n", "utf8");

      const rewriteLines = runMcp(manifest, "dcc-ast-grep", install.pluginRoot, [
        ...initializeAndListTools,
        {
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              language: "typescript",
              path: workspace,
              pattern: "console.log($MSG)",
              rewrite: "logger.info($MSG)",
            },
            name: "ast_grep.rewrite",
          },
        },
      ]);
      const rewrite = rewriteResponseSchema.parse(
        JSON.parse(rewriteLines[rewriteLines.length - 1] ?? ""),
      );
      expect(rewrite.result.matchCount).toBe(1);
      expect(readFileSync(fixturePath, "utf8")).toBe(before);

      const hashlineLines = runMcp(manifest, "dcc-hashline", install.pluginRoot, [
        ...initializeAndListTools,
        {
          id: 4,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { patchPath, path: fixturePath },
            name: "hashline.apply_patch",
          },
        },
      ]);
      const staleHash = hashlineApplyResponseSchema.parse(
        JSON.parse(hashlineLines[hashlineLines.length - 1] ?? ""),
      );
      expect(staleHash.result.applied).toBe(false);
      expect(readFileSync(fixturePath, "utf8")).toBe(before);
    } finally {
      rmSync(install.home, { force: true, recursive: true });
      rmSync(workspace, { force: true, recursive: true });
    }
  }, 20_000);

  it("plugin_only_install_no_optional_mcp_omits_optional_declarations", () => {
    const home = mkdtempSync(join(tmpdir(), "dcc-mcp-install-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "bin/dcc.mjs",
          "install",
          "--home",
          home,
          "--provider-mode=plugin-only",
          "--no-ast-grep",
          "--no-hashline",
          "--no-tui",
        ],
        { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 },
      );
      const config = readFileSync(join(home, ".codex", "config.toml"), "utf8");
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(0);
      expect(output).toContain("mcp server: dcc-lsp");
      expect(output).not.toContain("mcp server: dcc-ast-grep");
      expect(output).not.toContain("mcp server: dcc-hashline");
      expect(config).not.toContain("dcc_ast_grep");
      expect(config).not.toContain("dcc_hashline");
    } finally {
      rmSync(home, { force: true, recursive: true });
    }
  }, 20_000);
});
