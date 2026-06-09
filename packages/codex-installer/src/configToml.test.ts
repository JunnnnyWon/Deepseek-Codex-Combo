import { describe, expect, it } from "vitest";
import {
  countManagedProviderBlocks,
  removeManagedModelCatalogBlock,
  removeManagedPluginActivationBlock,
  removeManagedProfileBlock,
  removeManagedProviderBlock,
  renderDeepseekProfileBlock,
  renderModelCatalogBlock,
  renderPluginActivationBlock,
  renderPluginMcpBlock,
  renderProxyProviderBlock,
  upsertManagedModelCatalogBlock,
  upsertManagedPluginActivationBlock,
  upsertManagedProfileBlock,
  upsertManagedProviderBlock,
} from "./configToml";

describe("Codex config TOML patching", () => {
  it("inserts_model_catalog_at_toml_root_before_tables", () => {
    const userConfig = ['model = "unchanged"', "[profiles.user]", 'model = "kept"'].join("\n");

    const inserted = upsertManagedModelCatalogBlock(userConfig, {
      path: "/tmp/dcc/model-catalog.json",
    });
    const replaced = upsertManagedModelCatalogBlock(inserted, {
      path: "/tmp/dcc/next-model-catalog.json",
    });
    const removed = removeManagedModelCatalogBlock(replaced);

    expect(inserted).toMatch(
      /^# >>> DCC managed: model catalog\nmodel_catalog_json = "\/tmp\/dcc\/model-catalog\.json"/,
    );
    expect(replaced).toContain('model_catalog_json = "/tmp/dcc/next-model-catalog.json"');
    expect(replaced).not.toContain('model_catalog_json = "/tmp/dcc/model-catalog.json"');
    expect(removed).toContain('model = "unchanged"');
    expect(removed).toContain("[profiles.user]");
    expect(removed).not.toContain("model_catalog_json");
  });

  it("renders_model_catalog_path_as_escaped_toml_string", () => {
    const block = renderModelCatalogBlock({ path: '/tmp/dcc/"quoted"/catalog.json' });

    expect(block).toBe('model_catalog_json = "/tmp/dcc/\\"quoted\\"/catalog.json"');
  });

  it("insert_replace_remove_managed_provider_block", () => {
    const userConfig = ['model = "unchanged"', "[profiles.user]", 'model = "kept"'].join("\n");

    const inserted = upsertManagedProviderBlock(userConfig, {
      host: "127.0.0.1",
      port: 41473,
    });
    const replaced = upsertManagedProviderBlock(inserted, {
      host: "127.0.0.1",
      port: 41474,
    });
    const removed = removeManagedProviderBlock(replaced);

    expect(inserted).toContain("# >>> DCC managed: provider deepseek_proxy");
    expect(replaced).toContain('base_url = "http://127.0.0.1:41474/v1"');
    expect(replaced).not.toContain('base_url = "http://127.0.0.1:41473/v1"');
    expect(countManagedProviderBlocks(replaced)).toBe(1);
    expect(removed).toContain('model = "unchanged"');
    expect(removed).toContain("[profiles.user]");
    expect(removed).not.toContain("provider deepseek_proxy");
  });

  it("renders_proxy_provider_without_auth_material", () => {
    const block = renderProxyProviderBlock({ host: "127.0.0.1", port: 41473 });

    expect(block).toContain("[model_providers.deepseek_proxy]");
    expect(block).toContain('base_url = "http://127.0.0.1:41473/v1"');
    expect(block).not.toContain("api_key");
    expect(block).not.toContain("Authorization");
  });

  it("renders_plugin_mcp_toggles_as_codex_config_structs", () => {
    const block = renderPluginMcpBlock({ astGrepEnabled: true, hashlineEnabled: true });

    expect(block).toContain('[plugins."deepseek-codex-combo@deepseek-codex-combo".mcp_servers]');
    expect(block).toContain("dcc_ast_grep = { enabled = true }");
    expect(block).toContain("dcc_hashline = { enabled = true }");
    expect(block).not.toContain("dcc_ast_grep = true");
    expect(block).not.toContain("dcc_hashline = true");
  });

  it("insert_replace_remove_managed_plugin_activation_block", () => {
    const userConfig = ['model = "unchanged"', "[profiles.user]", 'model = "kept"'].join("\n");

    const inserted = upsertManagedPluginActivationBlock(userConfig);
    const replaced = upsertManagedPluginActivationBlock(inserted);
    const removed = removeManagedPluginActivationBlock(replaced);

    expect(inserted).toContain("# >>> DCC managed: plugin deepseek-codex-combo activation");
    expect(replaced.match(/deepseek-codex-combo@deepseek-codex-combo/g)?.length).toBe(1);
    expect(removed).toContain('model = "unchanged"');
    expect(removed).not.toContain("deepseek-codex-combo activation");
  });

  it("renders_plugin_activation_for_codex_plugin_loader", () => {
    const block = renderPluginActivationBlock();

    expect(block).toContain('[plugins."deepseek-codex-combo@deepseek-codex-combo"]');
    expect(block).toContain("enabled = true");
  });

  it("insert_replace_remove_managed_deepseek_profile_block", () => {
    const userConfig = ['model = "unchanged"', "[profiles.user]", 'model = "kept"'].join("\n");

    const inserted = upsertManagedProfileBlock(userConfig, { codexAutonomous: false });
    const replaced = upsertManagedProfileBlock(inserted, { codexAutonomous: true });
    const removed = removeManagedProfileBlock(replaced);

    expect(inserted).toContain("# >>> DCC managed: profile deepseek-proxy");
    expect(inserted).toContain("[profiles.deepseek-proxy]");
    expect(inserted).toContain("[profiles.deepseek-flash]");
    expect(inserted).toContain('model_provider = "deepseek_proxy"');
    expect(inserted).toContain('model = "deepseek-v4-flash"');
    expect(inserted).not.toContain('approval_policy = "never"');
    expect(replaced).toContain('approval_policy = "never"');
    expect(removed).toContain('model = "unchanged"');
    expect(removed).toContain("[profiles.user]");
    expect(removed).not.toContain("deepseek-proxy");
    expect(removed).not.toContain("deepseek-flash");
  });

  it("renders_deepseek_profile_for_codex_config_profiles", () => {
    const block = renderDeepseekProfileBlock({ codexAutonomous: false });

    expect(block).toContain("[profiles.deepseek-proxy]");
    expect(block).toContain("[profiles.deepseek-flash]");
    expect(block).toContain('model_provider = "deepseek_proxy"');
    expect(block).toContain('model = "deepseek-v4-pro"');
    expect(block).toContain('model = "deepseek-v4-flash"');
  });
});
