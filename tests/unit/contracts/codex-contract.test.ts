import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface CodexContractSnapshot {
  readonly checkedDate: string;
  readonly sources: readonly string[];
  readonly customProviders: {
    readonly configScope: "user";
    readonly providerTable: "model_providers";
    readonly supportedWireApi: "responses";
    readonly projectConfigCannotOverride: readonly string[];
  };
  readonly plugins: {
    readonly manifestPath: ".codex-plugin/plugin.json";
    readonly defaultHooksPath: "hooks/hooks.json";
    readonly mcpConfigPath: ".mcp.json";
    readonly bundledHooksSupported: boolean;
    readonly bundledMcpSupported: boolean;
  };
}

const readSnapshot = (): CodexContractSnapshot =>
  JSON.parse(
    readFileSync(join(process.cwd(), "tests/fixtures/contracts/codex-contract.json"), "utf8"),
  ) as CodexContractSnapshot;

describe("Codex contract snapshot", () => {
  it("custom provider wire is Responses and scoped to user config", () => {
    const snapshot = readSnapshot();

    expect(snapshot.checkedDate).toBe("2026-06-07");
    expect(snapshot.sources).toContain("https://developers.openai.com/codex/config-advanced");
    expect(snapshot.customProviders).toMatchObject({
      configScope: "user",
      providerTable: "model_providers",
      supportedWireApi: "responses",
    });
    expect(snapshot.customProviders.projectConfigCannotOverride).toEqual(
      expect.arrayContaining(["model_provider", "model_providers", "openai_base_url"]),
    );
  });

  it("plugin manifest can bundle skills, hooks, and MCP config", () => {
    const snapshot = readSnapshot();

    expect(snapshot.sources).toContain("https://developers.openai.com/codex/plugins/build");
    expect(snapshot.sources).toContain("https://developers.openai.com/codex/hooks");
    expect(snapshot.sources).toContain("https://developers.openai.com/codex/mcp");
    expect(snapshot.plugins).toEqual({
      manifestPath: ".codex-plugin/plugin.json",
      defaultHooksPath: "hooks/hooks.json",
      mcpConfigPath: ".mcp.json",
      bundledHooksSupported: true,
      bundledMcpSupported: true,
    });
  });
});
