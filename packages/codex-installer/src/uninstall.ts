import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { removeManagedBlock } from "../../shared/src/managed-block.ts";
import {
  removeManagedModelCatalogBlock,
  removeManagedPluginActivationBlock,
  removeManagedPluginMcpBlock,
  removeManagedProfileBlock,
  removeManagedProviderBlock,
} from "./configToml.ts";

export interface UninstallOptions {
  readonly dryRun: boolean;
  readonly home: string;
}

export interface UninstallPlan {
  readonly configPath: string;
  readonly dryRun: boolean;
  readonly plannedRemovals: readonly string[];
  readonly preservedPaths: readonly string[];
  readonly renderedConfig: string;
}

const isMissingFile = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readConfig = async (configPath: string): Promise<string> => {
  try {
    return await readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  }
};

const createManagedRemovalPaths = (home: string): readonly string[] => [
  join(home, ".codex", "plugins", "cache", "deepseek-codex-combo", "deepseek-codex-combo", "0.1.0"),
  join(home, ".codex", "plugins", "deepseek-codex-combo"),
  join(home, ".codex", "marketplaces", "deepseek-codex-combo.json"),
  join(home, ".codex", "model-catalog.deepseek-codex-combo.json"),
  join(home, ".codex", "agents", "dcc-planner-pro.toml"),
  join(home, ".codex", "agents", "dcc-librarian-flash.toml"),
  join(home, ".codex", "agents", "dcc-verifier-pro.toml"),
  join(home, ".codex", "agents", "dcc-worker-flash.toml"),
  join(home, ".codex", "agents", "dcc-worker-pro.toml"),
  join(home, ".codex", "profiles", "deepseek-proxy.toml"),
  join(home, ".codex", "profiles", "deepseek-flash.toml"),
  join(home, ".codex", "profiles", "deepseek-current.toml"),
  join(home, "Library", "LaunchAgents", "com.deepseek-codex-combo.proxy.plist"),
  join(home, ".config", "systemd", "user", "deepseek-codex-combo-proxy.service"),
];

const removeManagedConfigBlocks = (document: string): string =>
  removeManagedBlock(
    removeManagedModelCatalogBlock(
      removeManagedProfileBlock(
        removeManagedPluginMcpBlock(
          removeManagedPluginActivationBlock(removeManagedProviderBlock(document)),
        ),
      ),
    ),
    "profile deepseek-current",
  );

const applyUninstallPlan = async (plan: UninstallPlan): Promise<void> => {
  await mkdir(dirname(plan.configPath), { recursive: true });
  await writeFile(plan.configPath, plan.renderedConfig, "utf8");
  await Promise.all(
    plan.plannedRemovals.map((plannedRemoval) =>
      rm(plannedRemoval, { force: true, recursive: true }),
    ),
  );
};

export const createUninstallPlan = async (options: UninstallOptions): Promise<UninstallPlan> => {
  const configPath = join(options.home, ".codex", "config.toml");
  const renderedConfig = removeManagedConfigBlocks(await readConfig(configPath));
  const plan: UninstallPlan = {
    configPath,
    dryRun: options.dryRun,
    plannedRemovals: createManagedRemovalPaths(options.home),
    preservedPaths: [join(options.home, ".dcc")],
    renderedConfig,
  };

  if (!options.dryRun) {
    await applyUninstallPlan(plan);
  }

  return plan;
};

export const renderUninstallPlanForCli = (plan: UninstallPlan): string =>
  [
    `uninstall: ${plan.dryRun ? "dry-run" : "apply"}`,
    "preserve: .dcc",
    "managed provider block: removed",
  ].join("\n");
