import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { upsertManagedProviderBlock } from "./configToml";
import { createInstallPlan } from "./install";
import { createUninstallPlan } from "./uninstall";

const tempHomes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "dcc-uninstall-test-"));
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

describe("uninstaller plan", () => {
  it("uninstall_preserves_user_files_and_evidence", async () => {
    const home = await makeHome();
    const codexHome = join(home, ".codex");
    const evidenceDir = join(home, ".dcc", "evidence");
    await mkdir(codexHome, { recursive: true });
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(join(evidenceDir, "keep.txt"), "keep", "utf8");
    const configPath = join(codexHome, "config.toml");
    await writeFile(
      configPath,
      upsertManagedProviderBlock('user_setting = "kept"\n', { host: "127.0.0.1", port: 41473 }),
      "utf8",
    );

    const plan = await createUninstallPlan({ dryRun: false, home });
    const nextConfig = await readFile(configPath, "utf8");

    expect(plan.preservedPaths).toContain(join(home, ".dcc"));
    expect(nextConfig).toContain('user_setting = "kept"');
    expect(nextConfig).not.toContain("provider deepseek_proxy");
    expect(await readFile(join(evidenceDir, "keep.txt"), "utf8")).toBe("keep");
  });

  it("uninstall_removes_all_dcc_managed_files_and_config_blocks", async () => {
    const home = await makeHome();
    const userProfilePath = join(home, ".codex", "profiles", "user.toml");
    const evidencePath = join(home, ".dcc", "evidence", "keep.txt");
    await mkdir(join(home, ".codex", "profiles"), { recursive: true });
    await mkdir(join(home, ".dcc", "evidence"), { recursive: true });
    await writeFile(userProfilePath, 'model = "user"\n', "utf8");
    await writeFile(evidencePath, "keep", "utf8");

    const installPlan = await createInstallPlan({
      codexAutonomous: false,
      dryRun: false,
      home,
      noTui: true,
      providerMode: "proxy",
      proxyAutostart: "none",
    });

    expect(await pathExists(installPlan.pluginPlan.pluginCachePath)).toBe(true);
    expect(await pathExists(installPlan.pluginPlan.marketplacePath)).toBe(true);
    expect(await pathExists(installPlan.pluginPlan.modelCatalogPath)).toBe(true);
    expect(await pathExists(installPlan.pluginPlan.agentPath)).toBe(true);
    expect(await pathExists(join(home, ".codex", "agents", "dcc-worker-pro.toml"))).toBe(true);
    expect(await pathExists(installPlan.pluginPlan.profilePath)).toBe(true);
    await writeFile(
      join(home, ".codex", "profiles", "deepseek-current.toml"),
      'model_provider = "deepseek_proxy"\nmodel = "deepseek-v4-flash"\n',
      "utf8",
    );
    await writeFile(
      join(home, ".codex", "config.toml"),
      `${await readFile(join(home, ".codex", "config.toml"), "utf8")}
# >>> DCC managed: profile deepseek-current
[profiles.deepseek-current]
model_provider = "deepseek_proxy"
model = "deepseek-v4-flash"
# <<< DCC managed: profile deepseek-current
`,
      "utf8",
    );

    await createUninstallPlan({ dryRun: false, home });
    const nextConfig = await readFile(join(home, ".codex", "config.toml"), "utf8");

    expect(nextConfig).not.toContain("provider deepseek_proxy");
    expect(nextConfig).not.toContain("plugin deepseek-codex-combo mcp_servers");
    expect(nextConfig).not.toContain("plugin deepseek-codex-combo activation");
    expect(nextConfig).not.toContain("deepseek-codex-combo@deepseek-codex-combo");
    expect(nextConfig).not.toContain("model catalog");
    expect(nextConfig).not.toContain("model_catalog_json");
    expect(nextConfig).not.toContain("profile deepseek-proxy");
    expect(nextConfig).not.toContain("profile deepseek-current");
    expect(nextConfig).not.toContain("[profiles.deepseek-proxy]");
    expect(nextConfig).not.toContain("[profiles.deepseek-flash]");
    expect(nextConfig).not.toContain("[profiles.deepseek-current]");
    expect(await pathExists(installPlan.pluginPlan.pluginCachePath)).toBe(false);
    expect(await pathExists(installPlan.pluginPlan.marketplacePath)).toBe(false);
    expect(await pathExists(installPlan.pluginPlan.modelCatalogPath)).toBe(false);
    expect(await pathExists(installPlan.pluginPlan.agentPath)).toBe(false);
    expect(await pathExists(join(home, ".codex", "agents", "dcc-worker-pro.toml"))).toBe(false);
    expect(await pathExists(installPlan.pluginPlan.profilePath)).toBe(false);
    expect(await pathExists(installPlan.pluginPlan.flashProfilePath)).toBe(false);
    expect(await pathExists(join(home, ".codex", "profiles", "deepseek-current.toml"))).toBe(false);
    expect(await readFile(userProfilePath, "utf8")).toBe('model = "user"\n');
    expect(await readFile(evidencePath, "utf8")).toBe("keep");
  }, 30_000);

  it("uninstall_is_idempotent_after_managed_files_are_removed", async () => {
    const home = await makeHome();
    await createInstallPlan({
      codexAutonomous: false,
      dryRun: false,
      home,
      noTui: true,
      providerMode: "proxy",
      proxyAutostart: "none",
    });

    const first = await createUninstallPlan({ dryRun: false, home });
    const second = await createUninstallPlan({ dryRun: false, home });

    expect(first.plannedRemovals).toEqual(second.plannedRemovals);
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
  }, 30_000);
});
