import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { countManagedProviderBlocks } from "./configToml";
import {
  createInstallPlan,
  renderInstallPlanForCli,
  UnsupportedProviderModeError,
} from "./install";

const tempHomes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "dcc-installer-test-"));
  tempHomes.push(home);
  return home;
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

afterEach(async () => {
  const homes = tempHomes.splice(0);
  await Promise.all(homes.map((home) => rm(home, { force: true, recursive: true })));
});

describe("installer plan", () => {
  it("proxy_install_writes_only_user_config", async () => {
    const home = await makeHome();
    const first = await createInstallPlan({
      codexAutonomous: false,
      dryRun: true,
      home,
      noTui: true,
      providerMode: "proxy",
      proxyAutostart: "none",
    });
    const second = await createInstallPlan({
      codexAutonomous: false,
      currentConfig: first.renderedConfig,
      dryRun: true,
      home,
      noTui: true,
      providerMode: "proxy",
      proxyAutostart: "none",
    });

    expect(second.providerMode).toBe("proxy");
    expect(second.autostart).toBe("none");
    expect(second.telemetry).toBe("disabled");
    expect(second.codexAutonomous).toBe(false);
    expect(second.renderedConfig).toContain('base_url = "http://127.0.0.1:41473/v1"');
    expect(second.renderedConfig).toContain(
      '[plugins."deepseek-codex-combo@deepseek-codex-combo"]',
    );
    expect(second.renderedConfig).toContain("enabled = true");
    expect(second.renderedConfig).toMatch(
      new RegExp(
        `^# >>> DCC managed: model catalog\\nmodel_catalog_json = "${second.pluginPlan.modelCatalogPath.replaceAll(
          "\\",
          "\\\\",
        )}"`,
      ),
    );
    expect(second.renderedConfig).toContain("[profiles.deepseek-proxy]");
    expect(second.renderedConfig).toContain("[profiles.deepseek-flash]");
    expect(second.renderedConfig).not.toContain("[profiles.deepseek-current]");
    expect(second.renderedConfig).toContain('model_provider = "deepseek_proxy"');
    expect(second.renderedConfig).toContain('model = "deepseek-v4-pro"');
    expect(second.renderedConfig).toContain('model = "deepseek-v4-flash"');
    expect(countManagedProviderBlocks(second.renderedConfig)).toBe(1);
    expect(second.plannedFiles.every((file) => file.startsWith(home))).toBe(true);
    expect(second.plannedFiles).toContain(
      join(home, ".codex", "profiles", "deepseek-current.toml"),
    );
    expect(second.plannedFiles).toContain(join(home, ".codex", "agents", "dcc-worker-pro.toml"));
    expect(second.pluginPlan.entries).toHaveLength(1);
  });

  it("plugin_only_install_omits_provider_block", async () => {
    const home = await makeHome();
    const plan = await createInstallPlan({
      astGrepEnabled: true,
      codexAutonomous: false,
      dryRun: true,
      home,
      hashlineEnabled: true,
      noTui: true,
      providerMode: "plugin-only",
      proxyAutostart: "none",
    });

    expect(plan.providerMode).toBe("plugin-only");
    expect(plan.renderedConfig).not.toContain("provider deepseek_proxy");
    expect(plan.pluginPlan.entries).toHaveLength(1);
    expect(renderInstallPlanForCli(plan, home)).toContain("dcc-lsp");
  });

  it("plugin_only_install_can_disable_optional_mcp_servers", async () => {
    const home = await makeHome();
    const plan = await createInstallPlan({
      astGrepEnabled: false,
      codexAutonomous: false,
      dryRun: true,
      home,
      hashlineEnabled: false,
      noTui: true,
      providerMode: "plugin-only",
      proxyAutostart: "none",
    });
    const renderedPlan = renderInstallPlanForCli(plan, home);

    expect(renderedPlan).toContain("dcc-lsp");
    expect(renderedPlan).not.toContain("dcc-ast-grep");
    expect(renderedPlan).not.toContain("dcc-hashline");
  });

  it("native_mode_fails_closed_without_probe", async () => {
    const home = await makeHome();

    await expect(
      createInstallPlan({
        codexAutonomous: false,
        dryRun: true,
        home,
        noTui: true,
        providerMode: "native",
        proxyAutostart: "none",
      }),
    ).rejects.toBeInstanceOf(UnsupportedProviderModeError);
  });

  it("apply_install_rolls_back_config_when_plugin_copy_fails", async () => {
    const home = await makeHome();
    const configPath = join(home, ".codex", "config.toml");
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(configPath, 'model = "user"\n', "utf8");

    await expect(
      createInstallPlan({
        codexAutonomous: false,
        dryRun: false,
        home,
        noTui: true,
        providerMode: "proxy",
        proxyAutostart: "none",
        sourcePluginPath: join(home, "missing-plugin-source"),
      }),
    ).rejects.toThrow();

    expect(await readFile(configPath, "utf8")).toBe('model = "user"\n');
    expect(await pathExists(join(home, ".codex", "plugins", "deepseek-codex-combo"))).toBe(false);
    expect(
      await pathExists(
        join(
          home,
          ".codex",
          "plugins",
          "cache",
          "deepseek-codex-combo",
          "deepseek-codex-combo",
          "0.1.0",
        ),
      ),
    ).toBe(false);
    expect(
      await pathExists(join(home, ".codex", "marketplaces", "deepseek-codex-combo.json")),
    ).toBe(false);
  });

  it("apply_install_writes_codex_runtime_compatible_agent_and_mcp_paths", async () => {
    const home = await makeHome();
    const plan = await createInstallPlan({
      codexAutonomous: false,
      dryRun: false,
      home,
      noTui: true,
      providerMode: "proxy",
      proxyAutostart: "none",
    });

    const agent = await readFile(plan.pluginPlan.agentPath, "utf8");
    const mcpManifest = await readFile(join(plan.pluginPlan.pluginCachePath, ".mcp.json"), "utf8");
    const modelCatalog = JSON.parse(await readFile(plan.pluginPlan.modelCatalogPath, "utf8")) as {
      readonly models: readonly {
        readonly slug: string;
        readonly context_window: number;
        readonly max_context_window: number;
        readonly model_messages?: unknown;
      }[];
    };
    const pluginRootPlaceholder = "$" + "{PLUGIN_ROOT}";

    expect(agent).toContain('name = "dcc-planner-pro"');
    expect(agent).toContain('model = "deepseek-v4-pro"');
    expect(agent).toContain("developer_instructions");
    expect(await readFile(join(home, ".codex", "agents", "dcc-worker-pro.toml"), "utf8")).toContain(
      'name = "dcc-worker-pro"',
    );
    expect(mcpManifest).toContain(plan.pluginPlan.pluginCachePath);
    expect(mcpManifest).not.toContain(pluginRootPlaceholder);
    expect(await readFile(plan.pluginPlan.profilePath, "utf8")).toContain(
      'model = "deepseek-v4-pro"',
    );
    expect(await readFile(plan.pluginPlan.flashProfilePath, "utf8")).toContain(
      'model = "deepseek-v4-flash"',
    );
    expect(await readFile(plan.pluginPlan.currentProfilePath, "utf8")).toContain(
      'model = "deepseek-v4-flash"',
    );
    expect(modelCatalog.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context_window: 1000000,
          max_context_window: 1000000,
          model_messages: expect.any(Object),
          slug: "deepseek-v4-pro",
        }),
        expect.objectContaining({
          context_window: 1000000,
          max_context_window: 1000000,
          model_messages: expect.any(Object),
          slug: "deepseek-v4-flash",
        }),
      ]),
    );
  });
});
